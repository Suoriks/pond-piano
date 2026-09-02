'use strict';
// Iteration 0051: exercise the exact secure loopback server used by Electron.
// The whole browser runtime must load through its narrow allowlist, render,
// start one real Web Audio voice from a gesture, remember it, and clean up.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'desktop-shell-51.png');

(async () => {
  const server = createStaticServer(ROOT);
  const origin = await listenOnLoopback(server);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu']
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    const failedResponses = [];
    page.on('pageerror', error => errors.push(`page: ${error}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('response', response => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });

    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Number.isFinite(Number(document.querySelector('#pond')?.dataset.budgetFrameMs)));
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

    const scriptPaths = await page.evaluate(() => [...document.scripts].map(script => new URL(script.src).pathname));
    check('all browser layers loaded through Electron allowlist', scriptPaths.length >= 10 && failedResponses.length === 0,
      failedResponses.join('; ') || `${scriptPaths.length} scripts`);

    await page.mouse.move(640, 390);
    await page.mouse.down();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 1);
    const held = await page.evaluate(() => ({
      voices: Number(document.querySelector('#pond').dataset.audioVoices || 0),
      frameMs: Number(document.querySelector('#pond').dataset.budgetFrameMs),
      played: document.body.classList.contains('has-played')
    }));
    check('desktop gesture started a real Web Audio voice', held.voices === 1, JSON.stringify(held));
    check('desktop pond kept rendering', held.played && held.frameMs >= 0, JSON.stringify(held));

    await page.waitForTimeout(420);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.scoreMemories || 0) >= 1);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 3000 });
    const ended = await page.evaluate(() => ({
      voices: Number(document.querySelector('#pond').dataset.audioVoices || 0),
      memories: Number(document.querySelector('#pond').dataset.scoreMemories || 0)
    }));
    check('desktop gesture entered the water score', ended.memories >= 1, JSON.stringify(ended));
    check('desktop audio voice released cleanly', ended.voices === 0, JSON.stringify(ended));
    check('no runtime or console errors', errors.length === 0, errors.join('; '));

    const failed = checks.filter(item => !item.ok);
    console.log(JSON.stringify({
      iteration: '0051-desktop-shell-smoke',
      origin,
      screenshot: OUT,
      passed: checks.length - failed.length,
      failed: failed.length,
      failures: failed,
      checks
    }, null, 2));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser?.close();
    await closeServer(server);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
