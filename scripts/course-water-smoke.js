'use strict';
// Production shell: the water itself takes the colour of the chosen course.
// Dawn keeps the mineral green the pond has always had, dusk turns the water
// into a deep warm blue, mist pales and gives colour up. The change is walked
// over a calm crossfade, never snapped mid-sentence, and under reduced motion
// the water simply takes the new colour in one frame. Choosing a course is a
// shore control, not a gesture: it wakes no sound and writes no phrase.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

const read = page => page.evaluate(() => {
  const canvas = document.querySelector('#pond');
  let diaryLines = 0;
  try { diaryLines = (JSON.parse(localStorage.getItem('pond-piano.diary.v1') || '{}').lines || []).length; } catch {}
  return {
    course: canvas.dataset.waterCourse || '',
    moving: canvas.dataset.waterMoving || '',
    deep: canvas.dataset.waterDeep || '',
    pigment: canvas.dataset.waterPigment || '',
    ink: canvas.dataset.inkHue || '',
    family: canvas.dataset.scaleFamily || '',
    audioState: canvas.dataset.audioState || 'uninitialized',
    diaryLines,
    status: document.querySelector('#status').textContent
  };
});

// The darkest pixel of the lower-left band is the mineral depth of the water:
// every glow the pond paints is additive, so the bottom of the ramp is the one
// place that shows the pigment the frame really used.
const darkestWater = page => page.evaluate(() => {
  const canvas = document.querySelector('#pond');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const x0 = Math.round(w * .03), y0 = Math.round(h * .62);
  const bw = Math.max(1, Math.round(w * .33) - x0), bh = Math.max(1, Math.round(h * .96) - y0);
  const data = ctx.getImageData(x0, y0, bw, bh).data;
  let best = [0, 0, 0], bestLum = Infinity;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = .2126 * r + .7152 * g + .0722 * b;
    if (lum < bestLum) { bestLum = lum; best = [r, g, b]; }
  }
  const [r, g, b] = best.map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  let hue = 0;
  if (delta > 0) {
    hue = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { hue: Math.round(hue), light: Math.round(l * 1000) / 10, sat: Math.round(saturation * 100), rgb: best, lum: Math.round(bestLum * 10) / 10 };
});

const chooseCourse = async (page, family) => {
  // A person taps the stone itself, not the hidden radio inside its label.
  await page.click(`.tuning-choice:has(input[name="tuning-family"][value="${family}"])`);
};

const settle = (page, family) => page.waitForFunction(
  expected => document.querySelector('#pond').dataset.waterCourse === expected
    && document.querySelector('#pond').dataset.waterMoving === '0',
  family,
  { timeout: 6000 }
);

// One honest sample per frame, so a shift can be proved to have been walked
// rather than snapped: what the water painted, and where it said it was going.
const installSampler = page => page.evaluate(() => {
  window.__waterFrames = [];
  const canvas = document.querySelector('#pond');
  const started = performance.now();
  const tick = () => {
    window.__waterFrames.push({
      t: Math.round(performance.now() - started),
      moving: canvas.dataset.waterMoving || '',
      course: canvas.dataset.waterCourse || '',
      hue: Number((canvas.dataset.waterDeep || '0').split(',')[0])
    });
    if (window.__waterFrames.length < 500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const waterFrames = page => page.evaluate(() => window.__waterFrames);

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), origin = await listenOnLoopback(server);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // ---- 1. The pond opens on dawn, and dawn is the water it always had ----
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#pond').dataset.waterDeep);
    const dawnRead = await read(page);
    assert.equal(dawnRead.course, 'dawn', 'the pond opens on dawn');
    assert.equal(dawnRead.moving, '0', 'nothing shifts before a stone is touched');
    assert.equal(dawnRead.family, 'dawn');
    assert.equal(dawnRead.deep, '180.0,65.0,5.0', `dawn keeps the same depth it had: ${dawnRead.deep}`);
    assert.equal(dawnRead.pigment, '175.0,178.0,180.0');
    assert.equal(dawnRead.ink, '158.0', 'dawn keeps the ink the pond always wrote');
    const dawnPixel = await darkestWater(page);
    console.log('dawn water:', JSON.stringify(dawnPixel));
    // The committed pond (68ab1be) paints this same probe as rgb(7,29,28) on
    // six consecutive frames; the palette must not move the default water.
    assert.ok(Math.abs(dawnPixel.hue - 177) <= 8, `dawn water is still the mineral green, got hue ${dawnPixel.hue}`);
    assert.ok(Math.abs(dawnPixel.light - 7.3) <= 2.5, `dawn water keeps its depth, got light ${dawnPixel.light}`);
    for (const [index, baseline] of [7, 29, 28].entries()) {
      assert.ok(Math.abs(dawnPixel.rgb[index] - baseline) <= 4,
        `the default water did not change colour: rgb ${dawnPixel.rgb.join(',')} against the committed ${[7, 29, 28].join(',')}`);
    }
    assert.equal(dawnRead.audioState, 'uninitialized', 'the water is not woken by merely opening');

    // ---- 2. Dusk is walked to, in flight, never snapped --------------------
    await installSampler(page);
    await chooseCourse(page, 'dusk');
    await settle(page, 'dusk');
    const walk = await waterFrames(page);
    const inFlight = walk.filter(frame => frame.moving === '1');
    assert.ok(inFlight.length >= 5, `the shift was really walked, only ${inFlight.length} frames in flight`);
    assert.ok(inFlight.every(frame => frame.course === 'dusk'), 'every frame in flight already names where the water is heading');
    for (let index = 1; index < inFlight.length; index += 1) {
      assert.ok(inFlight[index].hue >= inFlight[index - 1].hue - 1e-9,
        `the shift never doubles back: ${inFlight.map(frame => frame.hue).join(',')}`);
    }
    assert.ok(inFlight[inFlight.length - 1].hue > inFlight[0].hue, 'the water really moved toward dusk');
    assert.ok(inFlight.some(frame => frame.hue > 182 && frame.hue < 212),
      `an in-between pigment was really painted: ${inFlight.map(frame => frame.hue).join(',')}`);
    const walkMs = inFlight[inFlight.length - 1].t - inFlight[0].t;
    assert.ok(walkMs >= 1200 && walkMs <= 2600, `the walk is calm rather than a snap: ${walkMs}ms`);
    const duskRead = await read(page);
    assert.equal(duskRead.deep, '214.0,60.0,4.5', `dusk ends on its own depth: ${duskRead.deep}`);
    assert.equal(duskRead.pigment, '205.0,209.0,214.0');
    assert.equal(duskRead.ink, '196.0', `dusk writes the diary in its own cool blue: ${duskRead.ink}`);
    const duskPixel = await darkestWater(page);
    console.log('dusk water:', JSON.stringify(duskPixel));
    assert.ok(Math.abs(duskPixel.hue - 212) <= 9, `dusk really painted a warm blue, got hue ${duskPixel.hue}`);
    assert.ok(Math.abs(duskPixel.hue - dawnPixel.hue) >= 15, `dusk must not look like dawn: ${dawnPixel.hue} vs ${duskPixel.hue}`);
    assert.equal(duskRead.audioState, 'uninitialized', 'choosing a course is not a gesture');
    assert.equal(duskRead.diaryLines, 0, 'choosing a course writes no phrase');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/course-dusk-81.png') });

    // ---- 3. Mist pales the same water, and dawn returns --------------------
    await chooseCourse(page, 'mist');
    await settle(page, 'mist');
    const mistRead = await read(page);
    assert.equal(mistRead.deep, '162.0,24.0,8.0', `mist ends on its own depth: ${mistRead.deep}`);
    assert.equal(mistRead.ink, '156.0', `mist writes with its own paler quill: ${mistRead.ink}`);
    const mistPixel = await darkestWater(page);
    console.log('mist water:', JSON.stringify(mistPixel));
    assert.ok(Math.abs(mistPixel.hue - 162) <= 9, `mist really painted its own hue, got ${mistPixel.hue}`);
    assert.ok(Math.abs(mistPixel.hue - dawnPixel.hue) >= 8, `mist must not look like dawn: ${dawnPixel.hue} vs ${mistPixel.hue}`);
    assert.ok(mistPixel.light > duskPixel.light, `mist is the paler water: ${mistPixel.light} vs ${duskPixel.light}`);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/course-mist-81.png') });

    await chooseCourse(page, 'mist');
    const askedAgain = await read(page);
    assert.equal(askedAgain.moving, '0', 'asking for the course already worn changes nothing');

    // ---- 4. The pond remembers the course, and paints it without a shift ---
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#pond').dataset.waterDeep);
    const remembered = await read(page);
    assert.equal(remembered.course, 'mist', 'the pond remembers the course it was left in');
    assert.equal(remembered.deep, '162.0,24.0,8.0');
    assert.equal(remembered.moving, '0', 'a remembered course is worn at once, not walked to');
    await chooseCourse(page, 'dawn');
    await settle(page, 'dawn');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/course-dawn-81.png') });
    await context.close();

    // ---- 5. Reduced motion takes the new colour in one frame --------------
    const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
    const calmPage = await calm.newPage();
    calmPage.on('pageerror', e => errors.push(String(e)));
    calmPage.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await calmPage.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await calmPage.waitForFunction(() => document.querySelector('#pond').dataset.waterDeep);
    const calmStart = await read(calmPage);
    assert.equal(calmStart.course, 'dawn');
    await installSampler(calmPage);
    await chooseCourse(calmPage, 'dusk');
    await calmPage.waitForFunction(() => document.querySelector('#pond').dataset.waterDeep === '214.0,60.0,4.5', null, { timeout: 4000 });
    const calmDone = await read(calmPage);
    assert.equal(calmDone.course, 'dusk');
    assert.equal(calmDone.moving, '0', 'reduced motion never leaves the water in flight');
    const frames = await waterFrames(calmPage);
    assert.ok(frames.length > 2, `the sampler really saw frames: ${frames.length}`);
    assert.ok(frames.every(frame => frame.moving !== '1'), `no frame ever shifted under reduced motion: ${frames.map(frame => frame.moving).join(',')}`);
    assert.ok(frames.some(frame => frame.hue === 214), `the calm water really took the dusk colour: ${frames.map(frame => frame.hue).join(',')}`);
    const calmPixel = await darkestWater(calmPage);
    console.log('calm dusk water:', JSON.stringify(calmPixel));
    assert.ok(Math.abs(calmPixel.hue - 212) <= 9, `the calm water still took the dusk colour, got ${calmPixel.hue}`);
    await calm.close();

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('course-water-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });