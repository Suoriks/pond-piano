'use strict';
// Instrumented headless-Chromium smoke for iteration 0050: the far bank.
// A ripple born below the upper edge must reach it as one cool, quiet skim:
// real Web Audio transient, bounded shared voice pool, visible fold, clean end.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4300;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'far-bank-50.png');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`page: ${error}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const canvas = page.locator('#pond');
  const num = key => page.evaluate(k => Number(document.querySelector('#pond').dataset[k] || 0), key);
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // Unlock audio with a non-reactive warm-up that has time to settle.
  await page.mouse.move(195, 430);
  await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
  await page.waitForTimeout(2200);

  const before = await num('farSkims');
  // At y=.16 the expanding ellipse reaches the 10% far edge in under 1s.
  await page.mouse.move(330, Math.round(844 * .16));
  await page.mouse.down(); await page.waitForTimeout(75); await page.mouse.up();
  await page.waitForFunction(previous => Number(document.querySelector('#pond').dataset.farSkims || 0) > previous,
    before, { timeout: 2200 });
  const after = await num('farSkims');
  const voicesDuring = await num('pearlVoices');
  check('far-bank skim sounded', after === before + 1, `${before}->${after}`);
  check('skim entered the shared transient pool', voicesDuring >= 1 && voicesDuring <= 3, String(voicesDuring));

  // Let one renderer frame consume the new glint, then capture while the
  // 560ms cool fold is still alive.
  await page.waitForTimeout(80);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await canvas.screenshot({ path: OUT });
  await page.waitForTimeout(750);
  const voicesAfter = await num('pearlVoices');
  check('far-bank voice released cleanly', voicesAfter === 0, String(voicesAfter));
  check('no browser errors', errors.length === 0, errors.join('; '));

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  const failed = checks.filter(item => !item.ok);
  console.log(JSON.stringify({
    iteration: '0050-far-bank-smoke',
    screenshot: OUT,
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed,
    checks
  }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(async error => {
  console.error(error);
  try { await new Promise(resolve => server.close(resolve)); } catch {}
  process.exit(1);
});
