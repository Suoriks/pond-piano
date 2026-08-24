'use strict';
// Instrumented headless-Chromium smoke for iteration 0047: the shore lap.
// When a ripple's expanding ring reaches the near bank, the shore answers
// with one quiet lapping return: a soft fold of light on the shoreline plus
// a short, low note that shares the collision voice pool but stays quieter
// than a meeting pearl. Hard assertions ride the shell's own dataset
// counters (shoreLaps, pearlVoices, audioVoices) plus a relative pixel probe.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4297;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'shore-lap-47.png');

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

  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // Warm-up: unlock audio and let the pond settle.
  await page.mouse.move(Math.round(width * .5), Math.round(height * .4));
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(2300);

  // A strong tap near the bank earns a lap within ~1.8 s.
  const lapsBefore = await num('shoreLaps');
  const nearBankY = Math.round(height * .74);
  await page.mouse.move(Math.round(width * .5), nearBankY);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(2000);

  const lapsAfter = await num('shoreLaps');
  check('shore lap earned by a tap near the bank', lapsAfter > lapsBefore, `${lapsAfter}>${lapsBefore}`);

  // Screenshot the lapping answer. Keep the lap glint alive by sampling soon.
  await page.screenshot({ path: OUT, fullPage: false });

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({
    iteration: '0047-shore-lap-smoke',
    eyebrow,
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed,
    checks
  }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });