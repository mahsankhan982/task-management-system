const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

test('version comparison and scoped cache cleanup', async () => {
  const removed = [], unregistered = [];
  const exports = {};
  const context = {
    exports, URL,
    navigator: { serviceWorker: { getRegistrations: async () => [
      { active: { scriptURL: 'https://app.test/sw.js' }, unregister: async () => unregistered.push('app') },
      { active: { scriptURL: 'https://app.test/other/sw.js' }, unregister: async () => unregistered.push('other') },
    ] } },
    window: { location: { origin: 'https://app.test' }, caches: {} },
    caches: { keys: async () => ['task-manager-old', 'other-app'], delete: async name => removed.push(name) },
  };
  vm.runInNewContext(ts.transpile(fs.readFileSync(path.join(__dirname, '../src/lib/app-updates.ts'), 'utf8'), { module: ts.ModuleKind.CommonJS }), context);
  assert.equal(exports.isNewerVersion('v2.0.0', 'v1.9.9'), true);
  assert.equal(exports.isNewerVersion('v1.10.0', 'v1.9.0'), true);
  assert.equal(exports.isNewerVersion('v2.0.0', 'v2.0.0'), false);
  assert.equal(exports.isNewerVersion('v1.0.0', 'v2.0.0'), false);
  assert.equal(exports.isNewerVersion('bad', 'v2.0.0'), false);
  await exports.clearApplicationCaches();
  assert.deepEqual(removed, ['task-manager-old']);
  assert.deepEqual(unregistered, ['app']);
});

test('release gateway preserves pins and discovers new builds without restart', async () => {
  const meta = { defaultVersion: 'build-old', versions: [{ version: 'build-old', path: '/old', createdAt: 'old' }] };
  const workers = [];
  let spawned = 0;
  const module = { exports: {} };
  const originalHttp = http;
  const mockedRequire = name => {
    if (name === 'fs') return { readFileSync: () => JSON.stringify(meta), existsSync: file => !file.includes('broken') };
    if (name === 'child_process') return { spawn: (_exe, args) => {
      spawned++;
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      const server = http.createServer((_req, res) => { res.writeHead(200); res.end(JSON.stringify({ releaseId: 'build-new' })); });
      server.listen(Number(args[3]), '127.0.0.1'); workers.push(server);
      child.kill = () => { server.close(); child.emit('exit'); };
      return child;
    } };
    if (name === 'http') return originalHttp;
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'release-server.js'), 'utf8'), {
    require: mockedRequire, module, __dirname, URL, setTimeout, console,
    process: { env: { RELEASE_PORT_BASE: '45191' }, execPath: process.execPath, stdout: { write() {} }, stderr: { write() {} } },
  });
  const { gateway, parseCookies } = module.exports;
  assert.equal(parseCookies('tm_release=%broken').tm_release, undefined);
  gateway.listen(0, '127.0.0.1');
  await new Promise(resolve => gateway.once('listening', resolve));
  const base = 'http://127.0.0.1:' + gateway.address().port;
  try {
    let info = await (await fetch(base + '/__release-info?t=1')).json();
    assert.equal(info.updateAvailable, false); assert.equal(info.latestDisplayVersion, 'v1.0.0');
    meta.versions.push({ version: 'build-new', displayVersion: 'v2.0.0', path: '/new', createdAt: 'new' });
    info = await (await fetch(base + '/__release-info', { headers: { Cookie: 'tm_release=build-old' } })).json();
    assert.equal(info.updateAvailable, true); assert.equal(info.selectedVersion, 'build-old');
    assert.equal(info.latestDisplayVersion, 'v2.0.0'); assert.equal(spawned, 0);
    assert.equal((await (await fetch(base + '/version.json')).json()).releaseId, 'build-new');
    assert.equal((await fetch(base + '/__apply-update')).status, 405);
    assert.equal((await fetch(base + '/__apply-update', { method: 'POST', headers: { Origin: 'https://other.test' } })).status, 403);
    const applied = await fetch(base + '/__apply-update', { method: 'POST' });
    assert.equal(applied.status, 200); assert.match(applied.headers.get('set-cookie'), /tm_release=build-new/);
    assert.equal(spawned, 1);
    info = await (await fetch(base + '/__release-info', { headers: { Cookie: 'tm_release=build-new' } })).json();
    assert.equal(info.updateAvailable, false);
    meta.versions.push({ version: 'build-broken', path: '/broken' });
    const failed = await fetch(base + '/__apply-update', { method: 'POST' });
    assert.equal(failed.status, 503); assert.equal(failed.headers.get('set-cookie'), null);
  } finally {
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
    for (const worker of workers) { worker.closeAllConnections(); await new Promise(resolve => worker.close(resolve)); }
  }
});
