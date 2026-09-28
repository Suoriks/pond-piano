'use strict';
// One honest place that knows where the smoke Chromium lives.
//
// Every smoke used to name its browser build by hand, so a Playwright update
// silently orphaned a dozen of them: they asked for a removed chromium-1223
// while the only installed build was chromium-1234, and the suite reported a
// failure where the product was fine. This resolves the executable once, in
// the order that stays true across a browser update: an explicit override,
// then the build Playwright itself names, then the newest build actually
// installed on disk, and otherwise an honest refusal that says what it looked
// for instead of launching a path that is not there.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BROWSERS_ENV = 'PLAYWRIGHT_BROWSERS_PATH';
const OVERRIDE_ENV = 'POND_CHROME';
const PLAYWRIGHT_CORE = '/usr/lib/node_modules/openclaw/node_modules/playwright-core';

function browsersRoot(env = process.env) {
  const configured = env[BROWSERS_ENV];
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.cache', 'ms-playwright');
}

function buildNumber(name) {
  const match = /^chromium-(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

// Newest first. chromium_headless_shell-* is deliberately not a candidate:
// the smokes drive a full browser, and the shell cannot run them.
function installedBuilds(root) {
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  return names
    .map(name => ({ name, number: buildNumber(name) }))
    .filter(entry => entry.number !== null)
    .sort((a, b) => b.number - a.number);
}

function buildBinary(root, name) {
  const candidate = path.join(root, name, 'chrome-linux64', 'chrome');
  return fs.existsSync(candidate) ? candidate : null;
}

function existingFile(candidate) {
  return candidate && fs.existsSync(candidate) ? path.resolve(candidate) : null;
}

function playwrightBinary() {
  try {
    const { chromium } = require(PLAYWRIGHT_CORE);
    return existingFile(chromium.executablePath());
  } catch {
    return null;
  }
}

function resolveChromium(options = {}) {
  // Every path this returns must be a file that is really there, whether it
  // came from the environment, from a caller, or from disk.
  const override = options.override !== undefined ? options.override : process.env[OVERRIDE_ENV];
  const overridden = existingFile(override);
  if (overridden) return overridden;

  const named = options.playwrightPath !== undefined ? options.playwrightPath : playwrightBinary();
  const playwrightChoice = existingFile(named);
  if (playwrightChoice) return playwrightChoice;

  const root = options.browsersRoot || browsersRoot();
  for (const entry of installedBuilds(root)) {
    const binary = buildBinary(root, entry.name);
    if (binary) return binary;
  }

  const seen = installedBuilds(root).map(entry => entry.name).join(', ') || 'none';
  throw new Error(
    `pond smoke: no Chromium to run. Looked at ${OVERRIDE_ENV}, ${PLAYWRIGHT_CORE} ` +
    `and ${root} (installed builds: ${seen}).`
  );
}

module.exports = resolveChromium;
module.exports.resolveChromium = resolveChromium;
module.exports.browsersRoot = browsersRoot;