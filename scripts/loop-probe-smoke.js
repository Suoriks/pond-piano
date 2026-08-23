'use strict';
// Instrumented headless-Chromium smoke for iteration 0033: a circling diary
// line is visible on the water itself (warm point traveling the contour).
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4273;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'diary-loop-probe-33.png');

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

  // Draw a finished phrase: press, sweep, release.
  await page.mouse.move(90, 420);
  await page.mouse.down();
  for (let step = 0; step <= 24; step += 1) {
    await page.mouse.move(90 + step * 9, 420 + Math.sin(step / 4) * 26);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(700); // ink appears

  // Open the diary, start circulation on the only line.
  await page.locator('#diary-stone').click();
  await page.waitForTimeout(250);
  const loopBtn = page.locator('.diary-loop:not(:disabled)').first();
  await loopBtn.click();
  await page.waitForTimeout(900); // first pass scheduled; panel closed; trace breathes

  // Let the traveling point settle mid-contour.
  await page.waitForTimeout(1700);
  await page.screenshot({ path: OUT });

  const inkLines = await page.evaluate(() => Number(document.querySelector('#pond').dataset.inkLines || 0));
  const looping = await page.evaluate(() => document.querySelector('#pond').dataset.loopingLine || '0');
  const loopPasses = await page.evaluate(() => Number(document.querySelector('#pond').dataset.loopPasses || 0));
  const panelOpen = await page.locator('#diary-panel').evaluate(el => el.classList.contains('is-open') || getComputedStyle(el).visibility !== 'hidden');

  await browser.close();
  await context.close();
  server.close();
  console.log(JSON.stringify({
    ok: errors.length === 0 && inkLines === 1 && looping === '1' && loopPasses >= 1 && !panelOpen,
    inkLines, looping, loopPasses, panelOpen,
    errors
  }, null, 2));
  if (!(inkLines === 1 && looping === '1' && loopPasses >= 1 && !panelOpen)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });