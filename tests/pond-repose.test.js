'use strict';
// Iteration 0039: the pond survives a change of screen. The pure repose
// layer translates every live pixel-space artifact into the new space while
// keeping its normalized place on the water, so pitch, depth and stereo
// meaning of what already sounds stay identical.
const test = require('node:test');
const assert = require('node:assert/strict');
const repose = require('../pond-repose.js');

const FROM = { w: 390, h: 844 };
const TO = { w: 1280, h: 720 };

test('span stays positive and finite for missing or damaged sizes', () => {
  assert.equal(repose.span(0), repose.MIN_SPAN);
  assert.equal(repose.span(-40), repose.MIN_SPAN);
  assert.equal(repose.span(undefined), repose.MIN_SPAN);
  assert.equal(repose.span(NaN), repose.MIN_SPAN);
  assert.equal(repose.span(1280), 1280);
});

test('scalePoint preserves the normalized place in both axes', () => {
  const point = { x: 195, y: 211 }; // exactly .5/.25 on the old water
  const next = repose.scalePoint(point, FROM, TO);
  assert.ok(Math.abs(next.x / TO.w - point.x / FROM.w) < 1e-12);
  assert.ok(Math.abs(next.y / TO.h - point.y / FROM.h) < 1e-12);
  // Corners stay corners; center stays center.
  for (const [x, y] of [[0, 0], [390, 844], [195, 422]]) {
    const moved = repose.scalePoint({ x, y }, FROM, TO);
    assert.ok(Math.abs(moved.x / TO.w - x / FROM.w) < 1e-12);
    assert.ok(Math.abs(moved.y / TO.h - y / FROM.h) < 1e-12);
  }
});

test('reposeWaves moves centers and keeps voice-defining fields', () => {
  const waves = [
    { id: '1', x: 100, y: 200, born: 5, pressure: .7, strength: 1.1, frequency: 330 },
    null
  ];
  const next = repose.reposeWaves(waves, FROM, TO);
  assert.equal(next.length, 2);
  assert.equal(next[1], null);
  assert.equal(next[0].id, '1');
  assert.equal(next[0].born, 5);
  assert.equal(next[0].pressure, .7);
  assert.equal(next[0].strength, 1.1);
  assert.equal(next[0].frequency, 330);
  assert.ok(Math.abs(next[0].x / TO.w - 100 / FROM.w) < 1e-12);
  assert.ok(Math.abs(next[0].y / TO.h - 200 / FROM.h) < 1e-12);
});

test('reposeWaves survives a damaged size without throwing', () => {
  const next = repose.reposeWaves([{ x: 10, y: 20 }], { w: NaN, h: undefined }, TO);
  assert.equal(next.length, 1);
  assert.ok(Number.isFinite(next[0].x) && Number.isFinite(next[0].y));
});

test('reposeTrails carries both ends of the glide segment', () => {
  const trail = { x: 195, y: 422, fromX: 98, fromY: 633, born: 1, pressure: .5 };
  const [next] = repose.reposeTrails([trail], FROM, TO);
  assert.ok(Math.abs(next.x / TO.w - .5) < 1e-12);
  assert.ok(Math.abs(next.y / TO.h - .5) < 1e-12);
  assert.ok(Math.abs(next.fromX / TO.w - 98 / 390) < 1e-12);
  assert.ok(Math.abs(next.fromY / TO.h - 633 / 844) < 1e-12);
  assert.equal(next.pressure, .5);
  // A damaged tail falls back to the head instead of becoming NaN.
  const [healed] = repose.reposeTrails([{ x: 39, y: 84, fromX: NaN }], FROM, TO);
  assert.equal(healed.fromX, repose.scalePoint({ x: 39 }, FROM, TO).x);
});

test('reposeSplashes keeps launch angle while the origin follows water', () => {
  const splash = { x: 390, y: 844, born: 9, intensity: .8, angle: -.6 };
  const [next] = repose.reposeSplashes([splash], FROM, TO);
  assert.equal(next.angle, -.6);
  assert.equal(next.intensity, .8);
  assert.ok(Math.abs(next.x / TO.w - 1) < 1e-12);
  assert.ok(Math.abs(next.y / TO.h - 1) < 1e-12);
});

test('reposeCoronas stretches the spray plan with the surface', () => {
  const corona = {
    x: 195, y: 422, born: 2,
    spray: { depth: .4, rays: [{ dx: 78, dy: -84.4, life: .5 }, null] }
  };
  const [next] = repose.reposeCoronas([corona], FROM, TO);
  assert.equal(next.spray.rays.length, 2);
  assert.equal(next.spray.rays[1], null);
  // Horizontal reach stretches by 1280/390, vertical shrinks by 720/844.
  assert.ok(Math.abs(next.spray.rays[0].dx - 256) < 1e-9);
  assert.ok(Math.abs(next.spray.rays[0].dy + 72) < 1e-9);
  assert.equal(next.spray.depth, .4);
  // A corona with no spray plan still lands safely.
  const [bare] = repose.reposeCoronas([{ x: 1, y: 1 }], FROM, TO);
  assert.ok(Number.isFinite(bare.x) && Array.isArray(bare.spray.rays));
});

test('reposePoints relocates pearls and glints as single points', () => {
  const items = [{ x: 58, y: 844, born: 3, energy: .5 }, 'junk'];
  const next = repose.reposePoints(items, FROM, TO);
  assert.equal(next[0].energy, .5);
  assert.equal(next[1], 'junk');
  assert.ok(Math.abs(next[0].y / TO.h - 1) < 1e-12);
});

test('reposeFlights moves origin and every planned contact', () => {
  const flight = {
    born: 4,
    origin: { x: 195, y: 422 },
    contacts: [{ at: 10, x: 39, y: 168.8, delayMs: 30 }, null]
  };
  const [next] = repose.reposeFlights([flight], FROM, TO);
  assert.equal(next.contacts[1], null);
  assert.equal(next.contacts[0].at, 10);
  assert.ok(Math.abs(next.origin.x / TO.w - .5) < 1e-12);
  assert.ok(Math.abs(next.contacts[0].x / TO.w - .1) < 1e-12);
  assert.ok(Math.abs(next.contacts[0].y / TO.h - .2) < 1e-12);
});

test('reposePointer keeps gesture anchors and re-arms the eddy', () => {
  const pointer = {
    x: 117, y: 633, sampledX: 110, sampledY: 620,
    originX: 97.5, originY: 633, pressure: .42,
    eddy: { centerX: 117, centerY: 633, lastX: 130, lastY: 650, radius: 26, angle: Math.PI / 2, active: true }
  };
  const next = repose.reposePointer(pointer, FROM, TO);
  assert.equal(next.pressure, .42);
  assert.ok(Math.abs(next.x / TO.w - .3) < 1e-12);
  assert.ok(Math.abs(next.y / TO.h - .75) < 1e-12);
  assert.ok(Math.abs(next.sampledX / TO.w - 110 / 390) < 1e-12);
  assert.ok(Math.abs(next.originY / TO.h - .75) < 1e-12);
  assert.equal(next.eddy.active, true);
  assert.ok(Math.abs(next.eddy.centerX / TO.w - .3) < 1e-12);
  assert.ok(Math.abs(next.eddy.centerY / TO.h - .75) < 1e-12);
  // The arm keeps its polar meaning: radius scaled by relative stretch.
  assert.ok(Number.isFinite(next.eddy.lastX) && Number.isFinite(next.eddy.lastY));
  const armX = next.eddy.lastX - next.eddy.centerX;
  assert.ok(Math.abs(armX) < 1e-9); // cos(pi/2)
  const armY = next.eddy.lastY - next.eddy.centerY;
  assert.ok(armY > 0 && Math.abs(armY - 26 * (TO.h / FROM.h)) < 1e-9);
});

test('reposePointer heals missing anchors from the contact position', () => {
  const next = repose.reposePointer({ x: 195, y: 422 }, FROM, TO);
  assert.equal(next.sampledX, next.x);
  assert.equal(next.sampledY, next.y);
  assert.equal(next.originX, next.x);
  assert.equal(next.originY, next.y);
});

test('reposePointers maps each live contact and keeps other ids', () => {
  const pointers = new Map([
    ['kb', null],
    [7, { x: 390, y: 844 }]
  ]);
  const next = repose.reposePointers(pointers, FROM, TO);
  assert.ok(next instanceof Map);
  assert.equal(next.get('kb'), null);
  assert.ok(Math.abs(next.get(7).x / TO.w - 1) < 1e-12);
});
