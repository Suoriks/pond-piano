'use strict';
// Production shell: the keyboard map is a guest of the water. On a short
// viewport (a phone in landscape, a small window) it must take only the room
// left below its trigger and scroll inside — the pond itself never shifts up
// to reveal it, and the title never gets cut off the top of the screen.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const VIEWPORTS = [
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'phone-landscape-small', width: 667, height: 375 },
  { name: 'desktop-short', width: 1280, height: 640 },
  { name: 'phone-portrait', width: 390, height: 844 }
];

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true, args: ['--no-sandbox', '--disable-gpu']
  });
  const report = [];
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(url, { waitUntil: 'networkidle' });
      // The introduction is a different story; this smoke is about geometry.
      await page.evaluate(() => { try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {} });
      await page.reload({ waitUntil: 'networkidle' });

      const restTop = await page.evaluate(() => Math.round(document.querySelector('.title-block').getBoundingClientRect().top));
      await page.evaluate(() => document.querySelector('#pond').focus());
      await page.keyboard.press('?');
      await page.waitForFunction(() => document.querySelector('#legend-control').classList.contains('is-open'));
      await page.waitForTimeout(320);

      const shot = await page.evaluate(() => {
        const panel = document.querySelector('#legend-panel').getBoundingClientRect();
        const list = document.querySelector('#legend-list');
        const main = document.querySelector('main');
        // Where the shore pebbles live, the open map must win the hit test:
        // a label bleeding through the rows is not a readable map.
        const pebble = document.querySelector('.tuning-pebbles').getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(pebble.left + pebble.width / 2),
          Math.round(pebble.top + pebble.height / 2)
        );
        return {
          mainScroll: Math.round(main.scrollTop),
          docScroll: Math.round((document.scrollingElement || document.body).scrollTop),
          titleTop: Math.round(document.querySelector('.title-block').getBoundingClientRect().top),
          panelBottom: Math.round(panel.bottom),
          panelTop: Math.round(panel.top),
          viewportH: innerHeight,
          listClipped: list.scrollHeight > list.clientHeight + 1,
          rows: list.querySelectorAll('.legend-key').length,
          closeBottom: Math.round(document.querySelector('#legend-close').getBoundingClientRect().bottom),
          pebbleOverlap: pebble.bottom > panel.top && pebble.top < panel.bottom,
          mapOwnsPebbleCorner: !!(hit && document.querySelector('#legend-panel').contains(hit))
        };
      });

      console.log(vp.name, JSON.stringify(shot));

      // The water never moves to make room for the map.
      assert.equal(shot.mainScroll, 0, `${vp.name}: the pond must not scroll its composition`);
      assert.equal(shot.docScroll, 0, `${vp.name}: the document must not scroll`);
      assert.equal(shot.titleTop, restTop, `${vp.name}: the title must stay where the player left it`);
      // The map stays inside the water, close button included.
      assert.ok(shot.panelBottom <= shot.viewportH, `${vp.name}: the map must not run past the bottom edge`);
      assert.ok(shot.closeBottom <= shot.viewportH, `${vp.name}: the close button must be reachable without scrolling`);
      assert.ok(shot.panelTop >= 0, `${vp.name}: the map must not start above the water`);
      // Every route is still there; on a short screen it scrolls inside.
      assert.equal(shot.rows, 7, `${vp.name}: all seven routes must exist`);
      if (vp.name === 'phone-portrait') {
        assert.equal(shot.listClipped, false, 'a 390x844 phone must still show the whole map without scrolling');
      }
      // Where the map covers the shore stones, it must read above them.
      if (shot.pebbleOverlap) {
        assert.equal(shot.mapOwnsPebbleCorner, true,
          `${vp.name}: the open map must paint above the shore stones it covers`);
      }

      await page.screenshot({ path: path.join(root, `output/pond-piano/landscape-map-70-${vp.name}.png`) });

      // A clipped map must be reachable by keyboard, not only by finger: the
      // list is the map's second focus stop and the page keys scroll it.
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'legend-close');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'legend-list',
        `${vp.name}: the map's list must be a keyboard stop`);
      if (shot.listClipped) {
        await page.keyboard.press('End');
        await page.waitForTimeout(120);
        const scrolled = await page.evaluate(() => document.querySelector('#legend-list').scrollTop);
        assert.ok(scrolled > 0, `${vp.name}: a covered route must be scrollable into view from the keyboard`);
        await page.keyboard.press('Home');
      }

      // Closing restores the trigger and the water still strikes a bowl.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#legend-control').classList.contains('is-open'));
      await page.evaluate(() => document.querySelector('#pond').focus());
      await page.keyboard.down('Space');
      await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
      await page.keyboard.up('Space');
      await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 12000 });

      assert.deepEqual(errors, [], `${vp.name}: no console or page errors`);
      report.push({ ...vp, ...shot, errors });
      await page.close();
    }
    console.log(JSON.stringify({ viewports: report.map(r => r.name), report }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });