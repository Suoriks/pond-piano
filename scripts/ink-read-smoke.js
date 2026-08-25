'use strict';
// Instrumented headless-Chromium smoke for iteration 0049: the pond reads its
// own score while it plays. A held note lays an ink line; then a quick tap
// away in open water sends a ripple whose ring travels across that line, and
// the surface re-strikes the phrase's own place as one quiet echo
// (dataset.inkReads) with a warm crossing glint. Featured assertions ride the
// dataset counters. Screenshot for visual QA.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4303;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'ink-read-49.png');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
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
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  const width = 390, height = 844;
  const num = k => page.evaluate((key) => Number((document.querySelector('#pond').dataset)[key] ?? '0'), k);
  const statusText = () => page.locator('#status').textContent();
  const tap = async (x, y, hold = 70) => {
    await page.mouse.move(Math.round(x), Math.round(y));
    await page.mouse.down();
    await page.waitForTimeout(hold);
    await page.mouse.up();
  };

  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // 1) Lay a readable ink line with a held note; retry briefly for timing.
  let inkNow = 0;
  for (let attempt = 0; attempt < 3 && inkNow < 1; attempt += 1) {
    await page.mouse.move(Math.round(width * .55), Math.round(height * .45));
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.up();
    await page.waitForTimeout(2600);
    inkNow = await num('inkLines');
  }
  check('a gliding hold left a readable ink line', inkNow >= 1, `inkLines=${inkNow}`);

  // 2) A quick tap on the opposite side sends a ripple whose ring crosses it.
  const readsBefore = await num('inkReads');
  await tap(width * .86, height * .4, 70);
  await page.waitForTimeout(2200);

  const readsAfter = await num('inkReads');
  check('a passing ripple re-reads the ink line once', readsAfter >= readsBefore + 1,
    `inkReads ${readsBefore} -> ${readsAfter}`);

  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT, fullPage: false });

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({
    iteration: '0049-ink-read-smoke',
    eyebrow,
    status: statusText(),
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed,
    checks,
    errors
  }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });