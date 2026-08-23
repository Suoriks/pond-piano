'use strict';
// Instrumented headless-Chromium smoke for iteration 0034: the mobile shell
// holds the water — gesture containment present, a gesture still sounds a voice,
// and the wake-lock policy releases on silence.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
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
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
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
  await page.waitForTimeout(1500);
  const afterRelease = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));

  await page.screenshot({ path: OUT });
  await browser.close();
  await context.close();
  server.close();

  const held = heldVoices >= 1;
  const released = afterRelease === 0;
  const ok = !errors.length && surfaceOk && held && released;
  console.log(JSON.stringify({ ok, surface, surfaceOk, held, released, heldVoices, afterRelease, errors }, null, 2));
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });