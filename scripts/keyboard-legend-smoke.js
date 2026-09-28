'use strict';
// Production shell: the keyboard map is discoverable, honest and closable,
// and opening it never steals the water's own keyboard or a text field.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');
const a11y = require('../pond-a11y.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true, args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });

    // Iteration 0069 gave the map an honest self-introduction on a first
    // keyboard visit. This suite keeps proving the explicit paths ("?", the
    // trigger, Escape, the trap), so it first marks the map as already seen on
    // this device; the self-introduction has its own suite.
    await page.evaluate(key => localStorage.setItem(key, 'seen'), a11y.legendIntroKey());
    await page.reload({ waitUntil: 'networkidle' });

    const panelState = () => page.locator('#legend-panel').evaluate(el => ({
      visibility: getComputedStyle(el).visibility,
      expanded: document.querySelector('#legend-trigger').getAttribute('aria-expanded'),
      active: document.activeElement?.id || document.activeElement?.tagName || ''
    }));
    const legend = a11y.keyboardLegend();
    const rows = await page.locator('#legend-list dt.legend-key').allTextContents();
    const texts = await page.locator('#legend-list dd.legend-text').allTextContents();

    // Closed by default, honestly, with the whole honest list already rendered.
    const closed = await panelState();
    assert.equal(closed.visibility, 'hidden');
    assert.equal(closed.expanded, 'false');
    assert.deepEqual(rows, legend.map(route => route.keys));
    assert.deepEqual(texts, legend.map(route => route.text));

    // The pond is still the first thing Tab reaches, and "?" opens the map.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'pond');
    await page.keyboard.press('?');
    await page.waitForFunction(() => document.querySelector('#legend-control').classList.contains('is-open'));
    const opened = await panelState();
    assert.equal(opened.visibility, 'visible');
    assert.equal(opened.expanded, 'true');
    assert.equal(opened.active, 'legend-close', 'focus must move inside the map');
    assert.match(await page.locator('#status').textContent(), /Карта клавиш пруда открыта/);
    assert.match(rows.join('\n'), /G с зажатой чашей/);
    assert.match(rows.join('\n'), /H с зажатой чашей/);
    assert.match(texts.join('\n'), /свести его в жемчужину/);
    assert.match(texts.join('\n'), /удержать общий цветок/);
    // On a phone the whole map must be readable at once: a legend that hides
    // its own last rows behind a scroll is not honest discovery.
    const listFit = await page.evaluate(() => {
      const el = document.querySelector('#legend-list');
      return { scroll: el.scrollHeight, client: el.clientHeight };
    });
    assert.ok(listFit.scroll <= listFit.client + 1, `legend must fit without scrolling: ${listFit.scroll} > ${listFit.client}`);

    // Touch targets: the trigger and the close slate are both honest 44 px.
    // Measured as layout height (offsetHeight) so the opening transform's
    // scale cannot flatter the number mid-transition.
    const targetHeights = await page.evaluate(() => ({
      trigger: document.querySelector('#legend-trigger').offsetHeight,
      close: document.querySelector('#legend-close').offsetHeight
    }));
    const triggerBox = { height: targetHeights.trigger };
    const closeBox = { height: targetHeights.close };
    assert.ok(triggerBox.height >= 44, `trigger ${triggerBox.height} must be >= 44`);
    assert.ok(closeBox.height >= 44, `close ${closeBox.height} must be >= 44`);
    const triggerStyle = await page.locator('#legend-trigger').evaluate(el => getComputedStyle(el).outlineStyle);
    assert.equal(triggerStyle, 'none');

    // Focus never leaves the map on Tab: the close button comes first, then
    // the map's own scrollable list (a short screen clips it, and a keyboard
    // player must be able to reach that scroll), and then it wraps back.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'legend-list');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'legend-close');

    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-legend-68.png') });

    // Escape closes it and returns focus to the trigger that opened it.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#legend-control').classList.contains('is-open'));
    // The panel's visibility transition has a .22s delay before it hides.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#legend-panel')).visibility === 'hidden');
    const escaped = await panelState();
    assert.equal(escaped.visibility, 'hidden');
    assert.equal(escaped.expanded, 'false');
    assert.equal(escaped.active, 'legend-trigger');

    // The trigger itself opens the map, and a pointerdown outside closes it
    // without touching the water.
    await page.locator('#legend-trigger').click();
    await page.waitForFunction(() => document.querySelector('#legend-control').classList.contains('is-open'));
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.waitForFunction(() => !document.querySelector('#legend-control').classList.contains('is-open'));
    assert.equal((await panelState()).expanded, 'false');

    // A "?" typed into a real field is never stolen by the pond.
    await page.evaluate(() => {
      const field = document.createElement('input');
      field.id = 'smoke-field';
      document.body.appendChild(field);
      field.focus();
    });
    await page.keyboard.type('?');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'smoke-field');
    assert.equal(await page.locator('#smoke-field').inputValue(), '?');
    assert.equal((await panelState()).expanded, 'false');
    await page.evaluate(() => document.querySelector('#smoke-field')?.remove());

    // The map never broke the water: the keyboard still strikes a bowl.
    await page.evaluate(() => document.querySelector('#pond').focus());
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
    assert.match(await page.locator('#status').textContent(), /Звучит чаша/);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 12000 });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      legendRows: rows.length, opened, escaped, triggerHeight: triggerBox.height,
      closeHeight: closeBox.height, typedIntoField: '?', finalVoices: '0', errors,
      screenshot: 'output/pond-piano/keyboard-legend-68.png'
    }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });