'use strict';
// Instrumented headless-Chromium smoke for iteration 0035: the first screen
// invites the first gesture — a breathing light ring on the water plus a
// quiet text line, both gone forever after the first play (persisted).
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4279;
const OUT_ALIVE = path.join(ROOT, 'output', 'pond-piano', 'invitation-alive-35.png');
const OUT_AFTER = path.join(ROOT, 'output', 'pond-piano', 'invitation-after-35.png');

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
  await page.waitForTimeout(600);

  // Fresh pond: the invitation line is visible and the ring model runs.
  const lineVisibleBefore = await page.locator('#water-invitation').evaluate(el =>
    !el.classList.contains('is-gone') && getComputedStyle(el).display !== 'none');
  await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.inviteAlpha || 0) > 0);
  const eyebrow = await page.locator('.eyebrow').textContent();

  // Pixel proof of breathing: brightness inside the ring patch changes
  // between opposite breath phases more than a quiet control patch does.
  const patchMean = async (x, y, r) => page.evaluate(([px, py, pr]) => {
    const canvas = document.querySelector('#pond');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const data = ctx.getImageData(Math.round((px - pr) * dpr), Math.round((py - pr) * dpr),
      Math.max(2, Math.round(pr * 2 * dpr)), Math.max(2, Math.round(pr * 2 * dpr))).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (data.length / 4);
  }, [x, y, r]);
  const cx = 195, cy = Math.round(844 * .44);
  const brightA = await page.evaluate(() => Number(document.querySelector('#pond').dataset.inviteAlpha));
  await page.screenshot({ path: OUT_ALIVE });
  const ringA = await patchMean(cx, cy, 22);
  const controlA = await patchMean(58, 253, 22);
  await page.waitForTimeout(1700); // half a breath later
  const brightB = await page.evaluate(() => Number(document.querySelector('#pond').dataset.inviteAlpha));
  const ringB = await patchMean(cx, cy, 22);
  const controlB = await patchMean(58, 253, 22);
  const ringDelta = Math.abs(ringA - ringB), controlDelta = Math.abs(controlA - controlB);

  // First real gesture: the invitation dies and stays dead.
  await page.mouse.move(90, 460);
  await page.mouse.down();
  for (let step = 0; step <= 18; step += 1) {
    await page.mouse.move(90 + step * 10, 460 + Math.sin(step / 4) * 20);
    await page.waitForTimeout(36);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const lineGoneAfterPlay = await page.locator('#water-invitation').evaluate(el => el.classList.contains('is-gone'));
  const alphaAfterPlay = await page.evaluate(() => document.querySelector('#pond').dataset.inviteAlpha || '0');
  const storedAfterPlay = await page.evaluate(() => localStorage.getItem('pond-piano.invitation.v1'));
  const bodyHasPlayed = await page.evaluate(() => document.body.classList.contains('has-played'));
  await page.screenshot({ path: OUT_AFTER });

  // Reload: still no invitation — the pond remembers its player.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const lineHiddenAfterReload = await page.locator('#water-invitation').evaluate(el => el.classList.contains('is-gone'));
  const alphaAfterReload = await page.evaluate(() => document.querySelector('#pond').dataset.inviteAlpha || '0');

  await browser.close();
  await context.close();
  server.close();
  console.log(JSON.stringify({
    eyebrow,
    lineVisibleBefore, lineGoneAfterPlay, lineHiddenAfterReload,
    brightA: brightA.toFixed(3), brightB: brightB.toFixed(3),
    ringDelta: ringDelta.toFixed(2), controlDelta: controlDelta.toFixed(2),
    breathingProven: ringDelta > controlDelta * 1.5 && ringDelta > 1,
    alphaAfterPlay, alphaAfterReload,
    storedAfterPlay, bodyHasPlayed,
    errors
  }, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
