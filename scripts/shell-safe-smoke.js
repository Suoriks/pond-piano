'use strict';
// Instrumented headless-Chromium smoke for iteration 0034 (retargeted 0085):
// the mobile shell holds the water — gesture containment present, a gesture
// still sounds a voice, and the pool empties honestly on silence. In the bowl
// era a lift does not stop the note: the strike scheduled a finite decay, so
// the smoke waits for that decay to end instead of guessing a fixed tail.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4274;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'shell-safe-34.png');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let p = url.pathname;
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // The water sits inside a gesture surface that keeps touch/overscroll/text away.
  const surface = await page.locator('.gesture-surface').evaluate(el => {
    const s = getComputedStyle(el);
    return {
      userSelect: s.userSelect,
      touchCallout: s.webkitTouchCallout ?? 'n/a',
      overscroll: s.overscrollBehavior
    };
  });
  const surfaceOk = surface.userSelect === 'none' && surface.overscroll === 'none';

  // A real pointer gesture still sounds a voice (voices>0 while held), then frees it.
  await page.mouse.move(120, 420);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const heldVoices = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));
  await page.mouse.up();
  const lastRelease = Number(await page.evaluate(() => document.querySelector('#pond').dataset.lastRelease || NaN));
  // The bowl rings out the decay its strike scheduled; wait for the honest end.
  const released = await page.waitForFunction(
    () => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0, null, { timeout: 9000 }
  ).then(() => true, () => false);
  const afterRelease = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));

  await page.screenshot({ path: OUT });
  await browser.close();
  await context.close();
  server.close();

  const held = heldVoices >= 1;
  const tailBounded = Number.isFinite(lastRelease) && lastRelease > 0 && lastRelease <= 6;
  const ok = !errors.length && surfaceOk && held && released && afterRelease === 0 && tailBounded;
  console.log(JSON.stringify({ ok, surface, surfaceOk, held, released, heldVoices, afterRelease, lastRelease, tailBounded, errors }, null, 2));
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });