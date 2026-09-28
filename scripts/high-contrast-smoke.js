'use strict';
// Production shell: the shore instruments stay real controls when the reader
// asks for more contrast, or when the system forces its own palette. The
// chosen current must be told by edge weight and shape rather than by colour
// alone, the panels must stay readable, the focus ring must survive, and none
// of this may start the pond's audio on its own.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const rgbaToLuma = value => {
  const m = String(value).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return null;
  return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
};

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true, args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    const errors = [];
    // ---- 1. The system forces its own palette -------------------------------
    const forced = await browser.newPage({ viewport: { width: 390, height: 844 } });
    forced.on('pageerror', e => errors.push(String(e)));
    forced.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await forced.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
    });
    await forced.emulateMedia({ forcedColors: 'active' });
    await forced.goto(url, { waitUntil: 'networkidle' });

    const media = await forced.evaluate(() => ({
      forced: matchMedia('(forced-colors: active)').matches,
      more: matchMedia('(prefers-contrast: more)').matches
    }));
    assert.equal(media.forced, true, 'the forced palette is really in force for this proof');

    const edge = await forced.evaluate(() => {
      const css = el => {
        const s = getComputedStyle(el);
        return { w: s.borderTopWidth, style: s.borderTopStyle, bg: s.backgroundColor };
      };
      const pebbles = [...document.querySelectorAll('.tuning-pebble')];
      const choice = document.querySelector('.tuning-choice').getBoundingClientRect();
      return {
        chosen: css(pebbles[0]),
        neighbour: css(pebbles[1]),
        panel: css(document.querySelector('#volume-panel')),
        mapKey: css(document.querySelector('#legend-panel')),
        trigger: css(document.querySelector('#legend-trigger')),
        target: { w: choice.width, h: choice.height },
        audioState: document.querySelector('#pond').dataset.audioState || 'uninitialized',
        pondOutline: getComputedStyle(document.querySelector('#pond')).outlineWidth
      };
    });

    // Selection survives without colour: the chosen stone is doubled and
    // heavier, its neighbours keep one calm edge.
    assert.equal(edge.chosen.w, '3px', `the chosen current must thicken (got ${edge.chosen.w})`);
    assert.equal(edge.chosen.style, 'double', `the chosen current must change shape (got ${edge.chosen.style})`);
    assert.equal(edge.neighbour.w, '2px', `a calm neighbour keeps a thin edge (got ${edge.neighbour.w})`);
    assert.equal(edge.neighbour.style, 'solid', 'a calm neighbour stays a single edge');
    // Panels and buttons keep a hard, opaque body over the water.
    assert.equal(edge.panel.w, '2px', 'a panel keeps a hard edge under the forced palette');
    assert.ok(!/^rgba\(0, 0, 0, 0\)$/.test(edge.panel.bg), 'the volume panel must stay opaque');
    assert.equal(edge.mapKey.w, '2px', 'the keyboard map keeps a hard edge');
    assert.equal(edge.trigger.w, '2px', 'the map trigger keeps a hard edge');
    // Touch targets never shrink into the forced palette.
    assert.ok(edge.target.w >= 44 && edge.target.h >= 44,
      `the tuning stones stay >=44px (${edge.target.w}x${edge.target.h})`);
    // The controls must not have invented an audio system.
    assert.equal(edge.audioState, 'uninitialized', 'high contrast must not start the pond');

    // The water is still playable and the focus ring survives.
    await forced.keyboard.press('Tab');
    assert.equal(await forced.evaluate(() => document.activeElement?.id), 'pond');
    assert.notEqual(edge.pondOutline, '0px', 'the focused water keeps a visible ring');
    await forced.keyboard.down('Space');
    await forced.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    const struck = await forced.evaluate(() => document.querySelector('#pond').dataset.audioVoices);
    assert.ok(Number(struck) > 0, 'a real keyboard strike still sounds under the forced palette');
    await forced.keyboard.up('Space');
    await forced.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0');

    await forced.screenshot({ path: path.join(root, 'output/pond-piano/high-contrast-73-forced.png') });

    // ---- 2. The reader asks for more contrast -------------------------------
    const more = await browser.newPage({ viewport: { width: 390, height: 844 } });
    more.on('pageerror', e => errors.push(String(e)));
    more.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await more.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
    });
    await more.emulateMedia({ contrast: 'more' });
    await more.goto(url, { waitUntil: 'networkidle' });

    const lifted = await more.evaluate(() => {
      const css = el => getComputedStyle(el);
      const hint = css(document.querySelector('.hint'));
      const invitation = css(document.querySelector('.water-invitation'));
      const silence = css(document.querySelector('.water-silence'));
      const pebble = css(document.querySelector('.tuning-pebble'));
      return {
        matches: matchMedia('(prefers-contrast: more)').matches,
        hintOpacity: Number(hint.opacity),
        hintLuma: hint.color,
        invitation: invitation.color,
        silence: silence.color,
        pebbleEdge: pebble.borderTopColor,
        audioState: document.querySelector('#pond').dataset.audioState || 'uninitialized'
      };
    });

    assert.equal(lifted.matches, true, 'the more-contrast preference is really in force for this proof');
    assert.equal(lifted.hintOpacity, 1, 'the hint stops half-hiding when contrast is asked for');
    assert.equal(lifted.invitation, 'rgb(243, 248, 237)', 'the invitation reads at full strength');
    assert.equal(lifted.silence, 'rgb(247, 240, 227)', 'the honest silence reads at full strength');
    assert.ok(rgbaToLuma(lifted.hintLuma) > 190,
      `the hint text lifts to a bright tone (${lifted.hintLuma})`);
    assert.equal(lifted.audioState, 'uninitialized', 'a contrast preference must not start the pond');

    await more.screenshot({ path: path.join(root, 'output/pond-piano/high-contrast-73-more.png') });

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('high-contrast-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });