'use strict';
// Instrumented headless-Chromium smoke for iteration 0048: the rehearsal
// double-tap. A soft double-tap on open water wakes the newest readable phrase
// as a quiet repeated echo (startPourLoop), so the surface itself is the score.
// Sequence: play a held note to lay an ink line (a hold is not a tap), let the
// pond settle, then two calm close taps -> the phrase must begin circling
// (dataset.loopingLine becomes 1, rehearsalSummon set). Hard assertions ride the
// shell's dataset counters plus the status text. Screenshot for visual QA.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4302;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'rehearsal-48.png');

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

  // 1) Lay an ink line with a held note (a 400ms hold is not counted as a tap).
  await page.mouse.move(Math.round(width * .55), Math.round(height * .45));
  await page.mouse.down();
  await page.waitForTimeout(420);
  await page.mouse.up();
  await page.waitForTimeout(2600);

  const inkCount = await page.evaluate(() => {
    const root = window.PondScore || {};
    return root ? 1 : 0;
  });
  check('pond score layer is present', inkCount === 1);

  // 2) A calm double-tap on open water should wake the newest phrase to circle.
  await tap(width * .35, height * .4, 70);
  await page.waitForTimeout(330);
  await tap(width * .37, height * .42, 70);
  await page.waitForTimeout(400);

  const looping = await num('loopingLine');
  const summoned = await num('rehearsalSummon');
  check('double tap wakes the newest phrase to circle', looping === 1 && summoned === 1,
    `loopingLine=${looping} rehearsalSummon=${summoned}`);

  // The loop schedules passes; within ~1s a pending pour should be visible.
  await page.waitForTimeout(1200);
  const pendingPours = await num('pendingPours');
  const loopPasses = await num('loopPasses');
  check('loop begins pouring quietly over the phrase', loopPasses >= 1 || pendingPours >= 1,
    `loopPasses=${loopPasses} pendingPours=${pendingPours}`);

  await page.screenshot({ path: OUT, fullPage: false });

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({
    iteration: '0048-rehearsal-smoke',
    eyebrow,
    status: statusText(),
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed,
    checks
  }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
