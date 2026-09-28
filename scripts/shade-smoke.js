'use strict';
// Instrumented headless-Chromium smoke for the bowl era (originally 0040,
// retargeted 0085): after 0057 a tap is a struck bowl, not a droplet with a
// per-tap shade cycle. The live path no longer hands out rotating shades, so
// the old "same pitch, growing droplet" story is gone. The honest promise the
// product keeps instead is that a bowl is an alloy: one cell always sounds the
// same way (deterministic, never random), and a neighbouring cell is a
// different bowl with its own pitch and its own shine. That is the real
// variety axis a child hears when tapping the water.
//
// The probes are the shell's own honest numbers: dataset.bowlPitch and
// dataset.bowlShine are written at the strike, so the reading needs no decay
// wait. The shine is bounded [0,1] by the pure layer.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4287;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'bowl-alloy-85.png');

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
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  const width = 390, height = 844;
  const y = Math.round(height * .5);

  // One strike reads the bowl the shell just drew, then lifts. The probe is
  // written synchronously at the strike, so no decay wait is needed.
  async function strike(xFraction) {
    const x = Math.round(width * xFraction);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(90);
    const sample = await page.evaluate(() => {
      const ds = document.querySelector('#pond').dataset;
      return { pitch: Number(ds.bowlPitch || NaN), shine: Number(ds.bowlShine || NaN), held: Number(ds.audioVoices || 0) };
    });
    await page.mouse.up();
    await page.waitForTimeout(120);
    return { ...sample, x };
  }

  // Warm-up unlocks audio and invitation state; its numbers are not read.
  await strike(.3);
  await page.waitForTimeout(300);

  // The same cell twice: one bowl, one honest sound.
  const a1 = await strike(.3);
  await page.waitForTimeout(200);
  const a2 = await strike(.3);
  await page.waitForTimeout(200);
  // A neighbouring cell: a different bowl.
  const b = await strike(.5);

  await page.screenshot({ path: OUT, fullPage: false });

  const report = { eyebrow, a1, a2, b, errors };
  console.log(JSON.stringify(report, null, 2));

  const finite = v => Number.isFinite(v);
  const checks = {
    eyebrowNamesEtude: /^Этюд воды · \d+$/.test(report.eyebrow),
    gesturesHeard: a1.held >= 1 && a2.held >= 1 && b.held >= 1,
    sameCellSameBowl: finite(a1.pitch) && a1.pitch === a2.pitch && finite(a1.shine) && a1.shine === a2.shine,
    neighbouringCellDiffers: finite(b.pitch) && b.pitch !== a1.pitch && Math.abs(b.shine - a1.shine) >= .05,
    shinesBounded: [a1, a2, b].every(s => s.shine >= 0 && s.shine <= 1),
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  if (Object.values(checks).some(v => !v)) { process.exitCode = 1; }

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });