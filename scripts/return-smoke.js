'use strict';
// Instrumented headless-Chromium smoke for iteration 0042: a phrase that
// left the pond comes home. The diary's return stone reads the carried text
// back from the clipboard, re-seats it as fresh ink, and announces it on the
// water. Navigator clipboard is stubbed here so read/write resolve
// deterministically; the pure parse/re-seat layer is covered by the node
// suite.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4283;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'scroll-return-42.png');
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

  // Stub the clipboard with an in-page buffer so write/read both resolve;
  // the carried text is also mirrored on the canvas dataset for reads
  // independent of the host clipboard.
  await page.evaluate(() => {
    globalThis.__heldScroll = '';
    const stub = {
      writeText: text => { globalThis.__heldScroll = text; globalThis.__copiedScroll = text; return Promise.resolve(); },
      readText: () => Promise.resolve(globalThis.__heldScroll)
    };
    try { Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true }); }
    catch { try { navigator.clipboard = stub; } catch {} }
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
  const rowsBefore = await page.locator('.diary-row').count();
  const before = await page.evaluate(() => document.querySelector('#status').textContent);

  // Lift the phrase off the pond.
  await page.locator('.diary-take').first().click();
  await page.waitForTimeout(250);
  const copied = await page.evaluate(() => globalThis.__copiedScroll ?? document.querySelector('#pond').dataset.scrollText ?? null);
  const parsedInline = await page.evaluate((text) => {
    return typeof PondScore === 'object' && PondScore.parseScrollText ? PondScore.parseScrollText(text) : 'NO_PONDSCORE';
  }, copied);
  const readProbe = await page.evaluate(() => {
    try { const p = navigator.clipboard.readText(); return { kind: typeof p, isPromise: p instanceof Promise }; }
    catch (e) { return { threw: String(e) }; }
  });

  // Return the phrase home from the clipboard via the return stone.
  const returnBtn = await page.locator('#diary-return').count();
  await page.locator('#diary-return').click();
  await page.waitForTimeout(260);
  const inkAfter = await page.evaluate(() => document.querySelector('#pond').dataset.inkLines);
  const statusAfter = await page.evaluate(() => document.querySelector('#status').textContent);
  const returnedText = await page.evaluate(() => globalThis.__returnedText ?? null);
  const heldAfter = await page.evaluate(() => globalThis.__heldScroll ?? null);

  await page.screenshot({ path: OUT });
  await browser.close(); await context.close(); server.close();
  const result = { rowsBefore, before, copied, parsedInline, readProbe, returnBtn, returnedText, heldAfter, inkAfter, statusAfter, errors };
  console.log(JSON.stringify(result, null, 2));
  const copiedOk = typeof copied === 'string' && copied.includes('Пруд-пианино') && copied.includes('контур');
  const returnedOk = typeof returnedText === 'string' && returnedText.includes('Пруд-пианино') && typeof statusAfter === 'string' && statusAfter.includes('вернулась на воду');
  const pass = rowsBefore === 1 && copiedOk && returnedOk && errors.length === 0;
  if (!pass) process.exitCode = 1;
})().catch(err => { console.error(err); process.exit(1); });