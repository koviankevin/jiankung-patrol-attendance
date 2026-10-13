import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {test} from 'node:test';

test('API harness rejects remote origins and never follows redirects', async () => {
  let followed = false;
  const server = createServer((req, res) => {
    if (req.url === '/redirect') res.writeHead(302, {Location: '/destination'});
    else { followed = true; res.writeHead(200); }
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previous = process.env.TEST_URL;
  process.env.TEST_URL = `http://127.0.0.1:${address.port}`;
  try {
    const {base, localOrigin, localFetch} = await import('./helpers/local-api.mjs');
    for (const url of ['https://example.com', 'http://example.com',
      'https://localhost', 'http://localhost.example.com', 'http://user:pass@localhost',
      'http://127.0.0.1/api', 'http://localhost?target=remote', 'http://localhost#remote']) {
      assert.throws(() => localOrigin(url), /loopback/);
    }
    assert.equal(localOrigin(base), base);
    assert.throws(() => localFetch('http://example.com/api'), /escaped/);
    await assert.rejects(localFetch(`${base}/redirect`));
    assert.equal(followed, false, 'Redirect target must never receive a request');
  } finally {
    if (previous === undefined) delete process.env.TEST_URL;
    else process.env.TEST_URL = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
