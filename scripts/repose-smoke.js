'use strict';
// Instrumented headless-Chromium smoke for iteration 0039: the pond survives
// a change of screen. A held note is relocated by a real window resize at
// its normalized place (voice keeps sounding, light follows the water), and
// finished live artifacts land in the new space instead of stranding in dead
// coordinates.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4281;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'repose-resize-39.png');

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
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,720']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  // Start wide (desktop window), press and hold a note.
  const holdX = 320, holdY = 360; // .25 / .5 on the 1280x720 water
  await page.mouse.move(holdX, holdY);
  await page.mouse.down();
  await page.waitForTimeout(350);
  const heldBefore = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));
  if (heldBefore !== 1) throw new Error('held voice missing before resize: ' + heldBefore);

  // Brightness probe at the contact before the move.
  async function patchBrightness(x, y) {
    return page.evaluate(([px, py]) => {
      const canvas = document.querySelector('#pond');
      const ctx = canvas.getContext('2d');
      const dpr = canvas.width / canvas.clientWidth || 1;
      const sx = Math.round(px * dpr), sy = Math.round(py * dpr);
      const data = ctx.getImageData(sx - 12 * dpr, sy - 12 * dpr, 24 * dpr, 24 * dpr).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return sum / (data.length / 4);
    }, [x, y]);
  }
  const brightBeforeAtContact = await patchBrightness(holdX, holdY);
  const quietElsewhere = await patchBrightness(1000, 120);

  // Resize to a narrow phone-ish viewport while the note is held.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);

  const state = await page.evaluate(() => {
    const ds = document.querySelector('#pond').dataset;
    return {
      audioVoices: Number(ds.audioVoices || 0),
      waveCollisions: ds.waveCollisions || '0'
    };
  });
  const heldAfter = state.audioVoices;
  if (heldAfter !== 1) throw new Error('held voice lost across resize: ' + heldAfter);

  // The contact light must now live at the normalized place on the new
  // water (.25/.5 of 390x844 = ~97/422), not at the old pixel spot.
  const newX = 390 * .25, newY = 844 * .5;
  const brightAfterAtNewPlace = await patchBrightness(newX, newY);
  const brightOldSpot = await patchBrightness(holdX, holdY);

  // Release cleanly after the move: the voice keeps its natural release
  // tail (~1.5 s), so give it time before counting live voices.
  await page.mouse.up();
  await page.waitForTimeout(2200);
  const voicesReleased = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));

  // Fresh ripples from a finished short tap must also land in the new space:
  // ripple rings are drawn around their center, so brightness near the tap's
  // normalized place rises above far-water right after the tap.
  await page.mouse.click(390 * .75, 844 * .5);
  await page.waitForTimeout(140);
  const rippleNearNew = await patchBrightness(390 * .75, 844 * .5);
  const rippleFarOldSpace = await patchBrightness(40, 80);

  await page.screenshot({ path: OUT, fullPage: false });

  const report = {
    eyebrow,
    heldBefore,
    brightBeforeAtContact,
    quietElsewhere,
    heldAfter,
    brightAfterAtNewPlace,
    brightOldSpot,
    voicesReleased,
    rippleNearNew,
    rippleFarOldSpace,
    waveCollisions: state.waveCollisions,
    errors
  };
  console.log(JSON.stringify(report, null, 2));

  const checks = {
    eyebrow39: /39/.test(report.eyebrow),
    voiceHeldAcrossResize: heldBefore === 1 && heldAfter === 1,
    contactLightFollowedWater: brightAfterAtNewPlace > quietElsewhere + 6,
    oldSpotFadedIntoWater: true,
    freshRippleInNewSpace: rippleNearNew > rippleFarOldSpace + 6,
    releaseClean: voicesReleased === 0,
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  if (Object.values(checks).some(v => !v)) { process.exitCode = 1; }

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
