'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  closeServer,
  createStaticServer,
  listenOnLoopback,
  requestedPath
} = require('../electron/static-server.js');

function request(origin, requestPath, options = {}) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const call = http.request({
      host: url.hostname,
      port: url.port,
      path: requestPath,
      method: options.method || 'GET',
      headers: options.headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    call.on('error', reject);
    call.end();
  });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pond-piano-server-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Pond</title>');
  fs.writeFileSync(path.join(root, 'state.json'), '{"secret":"must-not-be-served"}');

  const server = createStaticServer(root);
  try {
    const origin = await listenOnLoopback(server);
    const shell = await request(origin, '/');
    assert.equal(shell.status, 200);
    assert.match(shell.headers['content-type'], /^text\/html/);
    assert.equal(shell.headers['x-content-type-options'], 'nosniff');
    assert.match(shell.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(shell.body, '<!doctype html><title>Pond</title>');

    const head = await request(origin, '/index.html', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');

    assert.equal((await request(origin, '/state.json')).status, 404, 'non-shell files must never be served');
    assert.equal((await request(origin, '/..%2fstate.json')).status, 403, 'encoded separators must be rejected');
    assert.equal(requestedPath('/../state.json').error, 403, 'traversal segments must be rejected before resolution');

    const wrongHost = await request(origin, '/', { headers: { Host: 'localhost' } });
    assert.equal(wrongHost.status, 421, 'the ephemeral server accepts only its exact loopback authority');
  } finally {
    await closeServer(server);
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('electron-static-server: loopback binding, allowlist, traversal rejection, MIME, and security headers verified');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
