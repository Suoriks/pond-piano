'use strict';
// Instrumented headless-Chromium smoke for iteration 0043: a lifted phrase
// rests on a small paper leaf inside the diary panel. Its carried text stays
// readable, keyboard travel reaches the leaf action, and one touch seats the
// phrase back on the water - clipboard or not. Navigator clipboard is
// stubbed so the copy path resolves deterministically; the pure summary
// layer is covered by the node suite.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4284;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'shore-leaf-43.png');
const OUT_LEAF = path.join(ROOT, 'output', 'pond-piano', 'shore-leaf-open-43.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let p = url.pathname; if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({ executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    globalThis.__heldScroll = '';
    const stub = {
      writeText: text => { globalThis.__heldScroll = text; globalThis.__copiedScroll = text; return Promise.resolve(); },
      readText: () => Promise.resolve(globalThis.__heldScroll)
    };
    try { Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true }); }
    catch { try { navigator.clipboard = stub; } catch {} }
  });

  // Draw one finished phrase so the diary has a row.
  await page.mouse.move(70, 430); await page.mouse.down();
  for (let step = 0; step <= 20; step += 1) {
    await page.mouse.move(70 + step * 9, 430 + Math.sin(step / 4) * 18);
    await page.waitForTimeout(34);
  }
  await page.mouse.up();
  await page.waitForTimeout(650);

  await page.locator('#diary-stone').click();
  await page.waitForTimeout(260);
  const rowsBefore = await page.locator('.diary-row').count();

  // Lift the phrase: the leaf must appear carrying its own text.
  await page.locator('.diary-take').first().click();
  await page.waitForTimeout(250);
  const copied = await page.evaluate(() => globalThis.__copiedScroll ?? null);
  const leafBefore = await page.evaluate(() => {
    const leaf = document.querySelector('#diary-leaf');
    const text = document.querySelector('#leaf-text')?.textContent ?? '';
    const rect = leaf?.getBoundingClientRect();
    const style = leaf ? getComputedStyle(leaf) : null;
    return {
      hidden: leaf?.hidden ?? null,
      text,
      visible: !!rect && rect.width > 40 && rect.height > 40,
      background: style?.backgroundImage?.slice(0, 24) ?? null,
      actionMinHeight: (() => {
        const b = document.querySelector('#leaf-return');
        return b ? getComputedStyle(b).minHeight : null;
      })()
    };
  });

  // Keyboard travel follows the eye: from the leaf action Tab lands on the
  // return stone, Shift+Tab comes back to the leaf.
  await page.locator('#leaf-return').focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const afterForward = await page.evaluate(() => document.activeElement?.id ?? null);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(120);
  const afterBack = await page.evaluate(() => document.activeElement?.id ?? null);

  // One touch seats the phrase back on the water, clipboard untouched.
  // Record the leaf moment itself before seating the phrase back.
  await page.screenshot({ path: OUT_LEAF });
  const inkBeforeReturn = await page.evaluate(() => document.querySelector('#pond').dataset.inkLines);
  await page.locator('#leaf-return').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    inkLines: document.querySelector('#pond').dataset.inkLines,
    status: document.querySelector('#status').textContent,
    leafHidden: document.querySelector('#diary-leaf')?.hidden ?? null,
    heldText: globalThis.__heldScroll ?? ''
  }));
  // The clipboard path keeps working beside the leaf.
  await page.locator('#diary-return').click();
  await page.waitForTimeout(300);
  const afterClipboard = await page.evaluate(() => ({
    inkLines: document.querySelector('#pond').dataset.inkLines,
    status: document.querySelector('#status').textContent
  }));

  // Reopen the panel for the record screenshot: the leaf is gone, the two
  // fresh ink lines are on the water.
  await page.locator('#diary-stone').click();
  await page.waitForTimeout(320);
  await page.screenshot({ path: OUT });
  await browser.close(); await context.close(); server.close();

  const result = { rowsBefore, copiedOk: typeof copied === 'string' && copied.includes('Пруд-пианино'), leafBefore, afterForward, afterBack, inkBeforeReturn, after, afterClipboard, errors };
  console.log(JSON.stringify(result, null, 2));
  const leafOk = leafBefore.hidden === false && leafBefore.visible &&
    leafBefore.text.includes('контур из') && leafBefore.text.includes('высота') &&
    leafBefore.actionMinHeight === '44px';
  const travelOk = afterForward === 'diary-return' && afterBack === 'leaf-return';
  const seatOk = inkBeforeReturn === '1' && after.inkLines === '2' &&
    String(after.status).includes('вернулась на воду') && after.leafHidden === true;
  const clipboardOk = afterClipboard.inkLines === '3' && String(afterClipboard.status).includes('вернулась на воду');
  const pass = rowsBefore === 1 && leafOk && travelOk && seatOk && clipboardOk && errors.length === 0;
  if (!pass) process.exitCode = 1;
})().catch(err => { console.error(err); process.exit(1); });
