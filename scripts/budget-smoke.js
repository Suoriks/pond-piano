'use strict';
// Instrumented headless-Chromium smoke for iteration 0036: the pond measures
// an honest frame budget each render and exposes its eased quality step.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4281;
const OUT_FULL = path.join(ROOT, 'output', 'pond-piano', 'budget-full-36.png');

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
  await page.waitForTimeout(900);

  const eyebrow = await page.locator('.eyebrow').textContent();
  // The budget layer must be wired into the render loop: dataset fields exist
  // and hold measured values after a few frames.
  const budgetWired = await page.evaluate(() => {
    const ds = document.querySelector('#pond').dataset;
    return Number.isFinite(Number(ds.budgetFrameMs)) && Number.isFinite(Number(ds.budgetStep));
  });
  const frameMs = await page.evaluate(() => Number(document.querySelector('#pond').dataset.budgetFrameMs || 0));

  // A short burst of ripples (a visible note) must not throw the shell; the
  // budget keeps measuring through it.
  await page.mouse.move(150, 480);
  await page.mouse.down();
  for (let step = 0; step <= 8; step += 1) {
    await page.mouse.move(150 + step * 12, 480 + Math.sin(step / 3) * 14);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const frameMsAfterGesture = await page.evaluate(() => Number(document.querySelector('#pond').dataset.budgetFrameMs || 0));
  const budgetStepAfter = await page.evaluate(() => document.querySelector('#pond').dataset.budgetStep || '0');

  await page.screenshot({ path: OUT_FULL });

  await browser.close();
  await context.close();
  server.close();
  console.log(JSON.stringify({
    eyebrow,
    budgetWired,
    frameMs: Number(frameMs).toFixed(2),
    frameMsAfterGesture: Number(frameMsAfterGesture).toFixed(2),
    budgetStepAfter: budgetStepAfter,
    noErrors: errors.length === 0,
    errors
  }, null, 2));
})().catch(err => { console.error(err); process.exit(1); });