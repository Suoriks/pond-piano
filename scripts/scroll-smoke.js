'use strict';
// Instrumented headless-Chromium smoke for iteration 0041: a finished phrase
// can leave the pond. The diary's third action per row lifts one ink line
// into the clipboard as a compact self-contained scroll (path contour,
// sounding pitch, depth, duration, chosen current). Navigator clipboard is
// stubbed here so the async write completes deterministically; the pure text
// layer itself is covered by the node suite.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4282;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'scroll-take-41.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let p = url.pathname; if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({ executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Stub the async clipboard so the write resolves; the carried phrase is
  // also mirrored on the canvas dataset (scrollText) for deterministic reads
  // independent of the host clipboard.
  await page.evaluate(() => {
    navigator.clipboard = { writeText: text => { globalThis.__copiedScroll = text; return Promise.resolve(); } };
  });

  // Draw one finished phrase so the diary has a row.
  await page.mouse.move(70, 430); await page.mouse.down();
  for (let step = 0; step <= 20; step += 1) {
    await page.mouse.move(70 + step * 9, 430 + Math.sin(step / 4) * 18);
    await page.waitForTimeout(34);
  }
  await page.mouse.up();
  await page.waitForTimeout(650);

  await page.locator('#diary-stone').click();
  await page.waitForTimeout(260);
  const rows = await page.locator('.diary-row').count();
  const takeExists = await page.locator('.diary-row .diary-take').count();
  const takeLabel = takeExists ? await page.locator('.diary-take').getAttribute('aria-label') : null;
  const before = await page.evaluate(() => document.querySelector('#status').textContent);

  // Lift the phrase off the pond: click its third action.
  await page.locator('.diary-take').first().click();
  await page.waitForTimeout(200);
  const copied = await page.evaluate(() => globalThis.__copiedScroll ?? document.querySelector('#pond').dataset.scrollText ?? null);
  const statusAfter = await page.evaluate(() => document.querySelector('#status').textContent);
  const lastScroll = await page.evaluate(() => document.querySelector('#pond').dataset.lastScroll);

  await page.screenshot({ path: OUT });
  await browser.close(); await context.close(); server.close();
  const result = {
    rows, buttonsPerRow: takeExists, takeLabel, before, copied, statusAfter, lastScroll, errors
  };
  console.log(JSON.stringify(result, null, 2));
  const copiedOk = typeof copied === 'string' && copied.includes('Пруд-пианино') && copied.includes('контур') && copied.includes('высота');
  const statusOk = typeof statusAfter === 'string' && statusAfter.includes('Фраза покинула пруд');
  const pass = rows === 1 && takeExists === 1 && takeLabel?.includes('Забрать') && copiedOk && statusOk && !!lastScroll && errors.length === 0;
  if (!pass) process.exitCode = 1;
})().catch(err => { console.error(err); process.exit(1); });