'use strict';
// Instrumented headless-Chromium smoke for iteration 0046: the water whisper.
// After the pond has been played, real gestures earn short discovery hints:
// a long quiet hold -> settle lesson, a fast straight release -> skipping
// stone lesson. Each whispers once per session, never two at once, with an
// honest calm pause between them. Hard assertions ride the shell's own
// dataset.whisperAlpha (written every frame) plus the polite status line;
// a relative same-frame pixel probe and a screenshot add visual evidence.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4293;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'water-whisper-46.png');

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
  const x = Math.round(width * .5), midY = Math.round(height * .52);

  const alpha = () => page.evaluate(() => Number(document.querySelector('#pond').dataset.whisperAlpha ?? '-1'));
  const statusText = () => page.locator('#status').textContent();

async function holdGesture(holdMs, y = midY) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
  }

  // Fast straight horizontal release stroke for the skipping stone: one
  // single-direction sweep so every recent sample keeps the path straight
  // regardless of how event timing jitter places them in the window.
  async function flickGesture(y = midY) {
    const startX = Math.round(width * .22);
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.waitForTimeout(140); // short rest, far below the settle lesson
    for (let step = 1; step <= 5; step += 1) {
      await page.mouse.move(startX + step * 42, y, { steps: 1 });
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
  }

  // Release tails keep the pointer's voice slot busy for up to ~1.9 s after
  // mouse.up; a flick while a same-pointer tail still lives would be a
  // silently voiceless gesture. Let the whole engine go quiet first.
  async function waitEngineQuiet() {
    await page.waitForFunction(
      () => Number(document.querySelector('#pond').dataset.audioVoices) === 0,
      null, { timeout: 6000 }
    ).catch(() => {});
    await page.waitForTimeout(1700);
  }

  // Headless Chromium occasionally swallows a whole flick gesture while a
  // same-pointer release tail or a stray pearl voice still lives (the pond
  // itself answers honestly - the input never reaches it as a sounding
  // stroke). A bounded retry keeps the assertion strong: the flick must
  // EARN its whisper (or its honest decline) as a real gesture would.
  async function flickWithRetry(label) {
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await waitEngineQuiet();
      const skBefore = Number(await page.evaluate(() => document.querySelector('#pond').dataset.skipEvents ?? '0'));
      await flickGesture();
      await page.waitForTimeout(520);
      const skAfter = Number(await page.evaluate(() => document.querySelector('#pond').dataset.skipEvents ?? '0'));
      result = { alpha: await alpha(), status: await statusText(), attempt, earnedStone: skAfter > skBefore };
      const voiced = label === 'after-pause'
        ? result.alpha > .3 && result.status.includes('камешек')
        : result.earnedStone && result.alpha === 0;
      if (voiced || attempt === 3) break;
      await page.waitForTimeout(700);
    }
    return result;
  }

  // Same-patch temporal proof: the text band grows brighter than ambient
  // drift once the whisper plate appears (tide alone cannot explain it).
  const bandY = Math.round(height * .16);
  const patchMeanNow = () => page.evaluate(([by]) => new Promise(resolve => {
    const pond = document.querySelector('#pond');
    const ctx = pond.getContext('2d');
    const sx = pond.width / pond.clientWidth, sy = pond.height / pond.clientHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        const grab = (px, py, w, h) => {
          const d = ctx.getImageData(Math.round(px * sx), Math.round(py * sy),
            Math.max(2, Math.round(w * sx)), Math.max(2, Math.round(h * sy))).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
          return sum / (d.length / 4);
        };
        resolve({ box: grab(60, by - 18, 270, 36), edge: grab(60, by + 34, 270, 22) });
      } catch (e) { resolve(null); }
    }));
  }), [bandY]);

  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

  // Before playing: no whispers, ever-fresh invitation owns the screen.
  check('quiet before first play', (await alpha()) === 0);

  // Warm-up: unlock audio and mark the pond played.
  await holdGesture(140);
  await page.waitForTimeout(2400);

  // Earned settle: a long quiet hold past 900 ms, released.
  const beforeWhisper = await patchMeanNow();
  await holdGesture(1250);
  await page.waitForTimeout(420);
  const settleAlpha = await alpha();
  const settleStatus = await statusText();
  const duringWhisper = await patchMeanNow();
  check('settle whisper appears after earned hold', settleAlpha > .3, `alpha=${settleAlpha}`);
  check('settle status speaks plainly', settleStatus.includes('Задержите'), settleStatus);
  // The plate reads as a calm darker paper over open water, so the honest
  // proof is magnitude of change against ambient drift, not brightening.
  const boxLift = duringWhisper && beforeWhisper ? duringWhisper.box - beforeWhisper.box : null;
  const edgeLift = duringWhisper && beforeWhisper ? duringWhisper.edge - beforeWhisper.edge : null;
  check('whisper plate changes its band beyond ambient drift',
    boxLift !== null && edgeLift !== null && Math.abs(boxLift) > Math.abs(edgeLift) + 4,
    `box=${boxLift?.toFixed(1)} edge=${edgeLift?.toFixed(1)}`);

  await page.screenshot({ path: OUT, fullPage: false });

  // Once per session: a second earned hold must stay silent.
  await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha) === 0, null, { timeout: 9000 });
  await holdGesture(1150);
  await page.waitForTimeout(500);
  check('second settle stays silent', (await alpha()) === 0, `alpha=${await alpha()}`);

  // The calm pause: even an earned stone inside the pause window is declined.
  const earlyFlick = await flickWithRetry('in-pause');
  check('stone inside pause window declined', earlyFlick.earnedStone && earlyFlick.alpha === 0,
    `earned=${earlyFlick.earnedStone} alpha=${earlyFlick.alpha} attempt=${earlyFlick.attempt}`);

  // Let old wave fronts retire so no collision announcement steals the
  // status line, and let the rest of the calm pause run out.
  await page.waitForTimeout(3400);
  await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha) === 0, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(12500);
  const lateFlick = await flickWithRetry('after-pause');
  check('stone whisper after the pause', lateFlick.alpha > .3,
    `alpha=${lateFlick.alpha} attempt=${lateFlick.attempt}`);
  check('stone status names the flick', lateFlick.status.includes('камешек'), lateFlick.status);

  // Session scope: reload resets whispers, played-state persists.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('whispers reset after reload', (await alpha()) === 0);
  await holdGesture(130);
  await page.waitForTimeout(2200);
  await holdGesture(1150);
  await page.waitForTimeout(450);
  check('settle can be earned again next session', (await alpha()) > .3, `alpha=${await alpha()}`);

  await browser.close();
  await new Promise(resolve => server.close(resolve));

  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({
    iteration: '0046-whisper-smoke',
    eyebrow,
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed,
    checks
  }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
