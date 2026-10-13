import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pbkdf2Sync, randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = ['api', 'carry-forward', 'admin-data', 'lifecycle'];
if (process.argv.length > 2) throw new Error('This runner accepts no URL, config or database overrides');
const built = JSON.parse(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'));
assert.equal(built.main, 'index.js', 'Unexpected build entry; review the isolated test config');
const journal = JSON.parse(await readFile(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
const migrations = journal.entries.map(entry => `${entry.tag}.sql`);
assert.deepEqual([...migrations].sort(), (await readdir(path.join(root, 'drizzle'))).filter(f => f.endsWith('.sql')).sort());
const logs = path.join(root, 'test-results/api');
await mkdir(logs, {recursive: true});
const scratch = await mkdtemp(path.join(tmpdir(), 'patrol-ci-'));
let active;

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(deadline); }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await stop(active);
  await rm(scratch, {recursive: true, force: true});
  process.exit(signal === 'SIGINT' ? 130 : 143);
});

function launch(args, cwd, env, logName) {
  const log = createWriteStream(path.join(logs, logName));
  const child = spawn(process.execPath, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
  // Retain actionable server/migration/test output, never configs or the database.
  child.stdout.on('data', chunk => {log.write(chunk); process.stdout.write(chunk);});
  child.stderr.on('data', chunk => {log.write(chunk); process.stderr.write(chunk);});
  child.on('close', () => log.end());
  child.on('error', error => log.end(String(error)));
  active = child;
  return child;
}

async function run(args, cwd, env, logName, timeout = 60_000) {
  const child = launch(args, cwd, env, logName);
  let timedOut = false;
  const timer = setTimeout(() => {timedOut = true; void stop(child);}, timeout);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(code, 0, `${logName} failed (signal=${signal}, timeout=${timedOut}); see test-results/api/${logName}`);
  } finally { clearTimeout(timer); }
}

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const {port} = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

try {
  for (const suite of suites) {
    console.log(`\n=== ${suite}: fresh local D1, all migrations, built Worker ===`);
    const cwd = path.join(scratch, suite);
    await mkdir(cwd);
    const base = `http://127.0.0.1:${await freePort()}`;
    const password = randomBytes(24).toString('hex');
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')}`;
    const config = path.join(cwd, 'wrangler.json');
    const state = path.join(cwd, 'state');
    // Construct an allowlist, never spread production bindings, vars, services,
    // account IDs, routes or remote configuration into a test Worker.
    await writeFile(config, JSON.stringify({
      name: 'patrol-ci-local',
      main: path.join(root, 'dist/server/index.js'),
      compatibility_date: built.compatibility_date,
      compatibility_flags: built.compatibility_flags,
      no_bundle: true,
      rules: [{type: 'ESModule', globs: ['**/*.js', '**/*.mjs']}],
      assets: {directory: path.join(root, 'dist/client')},
      d1_databases: [{binding: 'DB', database_name: 'patrol-ci-only',
        database_id: '00000000-0000-4000-8000-000000000001', remote: false}],
      vars: {ADMIN_PASSWORD_HASH: hash, SITE_ORIGIN: base},
    }));
    // Do not inherit Cloudflare credentials, proxy settings, application secrets
    // or .env files from the developer's shell/checkout.
    const env = {
      PATH: process.env.PATH,
      XDG_CONFIG_HOME: cwd,
      CI: 'true', NO_COLOR: '1',
      CLOUDFLARE_CF_FETCH_ENABLED: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
      WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_REGISTRY_PATH: path.join(cwd, 'registry'),
      MINIFLARE_REGISTRY_PATH: path.join(cwd, 'miniflare-registry'),
    };
    const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
    for (const migration of migrations) {
      console.log(`Applying ${migration}`);
      await run([wrangler, 'd1', 'execute', 'DB', '--local', '--config', config,
        '--persist-to', state, '--file', path.join(root, 'drizzle', migration)],
      cwd, env, `${suite}-${migration}.log`);
    }
    const server = launch([wrangler, 'dev', '--local', '--config', config,
      '--persist-to', state, '--ip', '127.0.0.1', '--port', new URL(base).port,
      '--inspector-port', '0'], cwd, env, `${suite}-server.log`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        assert.ok(server.exitCode === null && server.signalCode === null, `${suite}: Worker exited before readiness`);
        try {
          const response = await fetch(`${base}/api/bootstrap`, {redirect: 'error', signal: AbortSignal.timeout(1000)});
          if (response.ok) {
            const data = await response.json();
            assert.deepEqual(data.events, [], 'New database must contain no exams');
            ready = true;
            break;
          }
        } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
        await delay(500);
      }
      assert.ok(ready, `${suite}: Worker not ready; see ${suite}-server.log`);
      await run([path.join(root, 'tests', `${suite}.mjs`)], cwd,
        {...env, TEST_URL: base, TEST_ADMIN_PASSWORD: password}, `${suite}-tests.log`, 120_000);
    } finally { await stop(server); }
  }
  console.log('\nAll four API suites passed against independent disposable local databases.');
} finally {
  await stop(active);
  await rm(scratch, {recursive: true, force: true});
}
