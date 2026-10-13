import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';

// Exercise the actual runner with disposable stand-ins, without Cloudflare access.
for (const mode of ['success', 'failure', 'signal']) {
  test(`API runner ${mode}: isolated children, cleanup and complete logs`, {
    skip: process.platform !== 'linux', timeout: 25_000,
  }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'patrol-runner-test-'));
    const pids: number[] = [];
    let output = '';
    let runner: ReturnType<typeof spawn> | undefined;
    try {
      for (const dir of ['scripts', 'tests', 'dist/server', 'drizzle/meta', 'node_modules/wrangler/bin']) {
        await mkdir(path.join(root, dir), {recursive: true});
      }
      await copyFile(new URL('../scripts/test-api-local.mjs', import.meta.url), path.join(root, 'scripts/test-api-local.mjs'));
      await writeFile(path.join(root, 'dist/server/wrangler.json'), JSON.stringify({
        main: 'index.js', vars: {PRODUCTION_SENTINEL: 'must-not-copy'},
        services: [{binding: 'PRODUCTION_SERVICE'}], account_id: 'must-not-copy',
      }));
      await writeFile(path.join(root, 'drizzle/meta/_journal.json'), JSON.stringify({entries: [{tag: '0000_test'}]}));
      await writeFile(path.join(root, 'drizzle/0000_test.sql'), '-- test migration');
      await writeFile(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        const http = require('node:http');
        const {spawn} = require('node:child_process');
        const args = process.argv.slice(2);
        const config = JSON.parse(fs.readFileSync(args[args.indexOf('--config') + 1]));
        assert.ok(args.includes('--local'));
        assert.equal(config.d1_databases[0].remote, false);
        assert.equal(config.d1_databases[0].database_id, '00000000-0000-4000-8000-000000000001');
        assert.equal(config.services, undefined);
        assert.equal(config.account_id, undefined);
        assert.deepEqual(Object.keys(config.vars).sort(), ['ADMIN_PASSWORD_HASH', 'SITE_ORIGIN']);
        for (const key of ['CLOUDFLARE_API_TOKEN', 'TEST_URL', 'TEST_ADMIN_PASSWORD', 'HTTP_PROXY']) {
          assert.equal(process.env[key], undefined, key + ' leaked from parent');
        }
        if (args[0] === 'd1') {
          fs.mkdirSync(args[args.indexOf('--persist-to') + 1]);
          console.log('migration complete');
        } else {
          console.log('SERVER_PID=' + process.pid);
          console.log('SUITE_CWD=' + process.cwd());
          ${mode === 'signal' ? `
            process.on('SIGTERM', () => {});
            const nested = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});console.log('DESCENDANT_PID='+process.pid);setInterval(()=>{},1000)"], {stdio: 'inherit'});
          ` : ''}
          http.createServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end('{"events":[]}');
          }).listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1');
        }
      `);
      for (const suite of ['api', 'carry-forward', 'admin-data', 'lifecycle']) {
        await writeFile(path.join(root, 'tests', `${suite}.mjs`), `
          import assert from 'node:assert/strict';
          assert.equal(new URL(process.env.TEST_URL).hostname, '127.0.0.1');
          assert.match(process.env.TEST_ADMIN_PASSWORD, /^[a-f0-9]{48}$/);
          console.log('TEST_RUNNING');
          ${mode === 'failure' ? "console.error('INTENTIONAL_FAILURE_LAST_LINE'); process.exitCode = 7;"
            : mode === 'signal' ? "setInterval(() => {}, 1000);" : "console.log('SUCCESS_LAST_LINE');"}
        `);
      }
      runner = spawn(process.execPath, [path.join(root, 'scripts/test-api-local.mjs')], {
        env: {...process.env, CLOUDFLARE_API_TOKEN: 'sentinel-only', TEST_URL: 'https://invalid.example',
          TEST_ADMIN_PASSWORD: 'sentinel-only', HTTP_PROXY: 'http://invalid.example'},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const closed = once(runner, 'close');
      runner.stdout!.on('data', data => {output += data;});
      runner.stderr!.on('data', data => {output += data;});
      if (mode === 'signal') {
        const deadline = Date.now() + 10_000;
        while ((!output.includes('TEST_RUNNING') || !output.includes('DESCENDANT_PID=')) && runner.exitCode === null) {
          assert.ok(Date.now() < deadline, output);
          await delay(20);
        }
        assert.ok(output.includes('TEST_RUNNING'), output);
        runner.kill('SIGTERM');
      }
      const [code] = await closed;
      for (const match of output.matchAll(/(?:SERVER|DESCENDANT)_PID=(\d+)/g)) pids.push(Number(match[1]));
      assert.equal(code, mode === 'success' ? 0 : mode === 'signal' ? 143 : 1, output);
      assert.equal(output.includes('All four API suites passed'), mode === 'success', output);
      const directories = [...output.matchAll(/SUITE_CWD=(.+)/g)].map(match => match[1]);
      assert.equal(directories.length, mode === 'success' ? 4 : 1, output);
      assert.equal(new Set(directories).size, directories.length);
      for (const cwd of directories) await assert.rejects(access(path.dirname(cwd)));
      for (const pid of pids) {
        // A reparented descendant may briefly remain a zombie until PID 1 reaps it.
        let running = false;
        try { running = !(await readFile(`/proc/${pid}/stat`, 'utf8')).includes(') Z '); } catch {}
        assert.equal(running, false, `Child ${pid} survived runner exit`);
      }
      const logs = path.join(root, 'test-results/api');
      assert.equal((await readdir(logs)).length, mode === 'success' ? 12 : 3);
      const testLog = await readFile(path.join(logs, 'api-tests.log'), 'utf8');
      assert.ok(testLog.includes(mode === 'failure' ? 'INTENTIONAL_FAILURE_LAST_LINE'
        : mode === 'success' ? 'SUCCESS_LAST_LINE' : 'TEST_RUNNING'), testLog);
    } finally {
      if (runner && runner.exitCode === null) runner.kill('SIGKILL');
      for (const match of output.matchAll(/(?:SERVER|DESCENDANT)_PID=(\d+)/g)) {
        try { process.kill(Number(match[1]), 'SIGKILL'); } catch {}
      }
      for (const match of output.matchAll(/SUITE_CWD=(.+)/g)) {
        await rm(path.dirname(match[1]), {recursive: true, force: true});
      }
      await rm(root, {recursive: true, force: true});
    }
  });
}
