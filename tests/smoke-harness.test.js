'use strict';
// Iteration 0082: the smoke harness keeps its own honesty.
//
// A hand-written Chromium build path in a smoke meant a Playwright update
// silently orphaned a dozen checks and the suite cried wolf where the product
// was fine. These tests hold the two durable rules that fix it: every smoke
// asks the shared resolver for its browser, and the landscape check reads its
// route count from the same pure layer that fills the map.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const resolveChromium = require('../scripts/chrome-path.js');

function fakeBrowsers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pond-browsers-'));
  const build = (name, binary = true) => {
    const bin = path.join(dir, name, 'chrome-linux64', 'chrome');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    if (binary) fs.writeFileSync(bin, '#!/bin/sh\n');
    return bin;
  };
  return { dir, build };
}

test('a hand-written Chromium override wins when it exists', () => {
  const { dir, build } = fakeBrowsers();
  const chosen = build('chromium-9999');
  assert.equal(
    resolveChromium({ override: chosen, playwrightPath: '/nonexistent', browsersRoot: dir }),
    chosen
  );
});

test('the newest installed build is chosen, and the headless shell is not a candidate', () => {
  const { dir, build } = fakeBrowsers();
  build('chromium-100');
  build('chromium_headless_shell-9999');
  const newest = build('chromium-101');
  assert.equal(
    resolveChromium({ override: '', playwrightPath: '/nonexistent', browsersRoot: dir }),
    newest
  );
});

test('an empty browser directory is refused honestly instead of launching nothing', () => {
  const { dir, build } = fakeBrowsers();
  build('chromium-100', false); // a directory without the binary is not a browser
  assert.throws(
    () => resolveChromium({ override: '', playwrightPath: '/nonexistent', browsersRoot: dir }),
    /no Chromium to run/
  );
});

test('Playwright still names the build on this host', () => {
  const named = resolveChromium();
  assert.ok(path.isAbsolute(named), 'the resolver returns an absolute path');
  assert.ok(fs.existsSync(named), `the resolved browser exists: ${named}`);
});

test('no smoke script freezes a browser build path again', () => {
  const offenders = fs.readdirSync(SCRIPTS)
    .filter(name => name.endsWith('.js'))
    .filter(name => /ms-playwright\/chromium-\d+/.test(fs.readFileSync(path.join(SCRIPTS, name), 'utf8')));
  assert.deepEqual(offenders, [], `these scripts must use scripts/chrome-path: ${offenders.join(', ')}`);
});

test('the landscape map check reads its route count from the pure layer', () => {
  const source = fs.readFileSync(path.join(SCRIPTS, 'landscape-map-smoke.js'), 'utf8');
  assert.match(source, /keyboardLegend\(\)\.length/, 'the route count comes from pond-a11y');
  assert.doesNotMatch(source, /shot\.rows, \d/, 'the route count is not frozen to a literal');
  assert.ok(require('../pond-a11y.js').keyboardLegend().length >= 7,
    'the legend still carries at least the routes the map was built for');
});