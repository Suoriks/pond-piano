'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { APP_FILES } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');

function localScriptSources(html) {
  return [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1])
    .filter(source => !/^(?:[a-z]+:)?\/\//i.test(source))
    .map(source => `/${source.replace(/^\.\//, '')}`);
}

test('desktop allowlist closes over every local runtime script in index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sources = localScriptSources(html);
  const missing = sources.filter(source => !APP_FILES.has(source));

  assert.ok(sources.length >= 10, 'the closure check must see the real pond runtime, not an empty shell');
  assert.deepEqual(missing, [], `Electron static server is missing required scripts: ${missing.join(', ')}`);
});

test('every allowlisted index script is present in both package file manifests', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packaged = new Set(packageJson.files || []);
  const built = new Set(packageJson.build?.files || []);
  const dependencies = localScriptSources(html).map(source => APP_FILES.get(source));

  assert.deepEqual(dependencies.filter(file => !packaged.has(file)), [],
    'package.files must contain every browser runtime script');
  assert.deepEqual(dependencies.filter(file => !built.has(file)), [],
    'build.files must contain every browser runtime script');
  assert.deepEqual(dependencies.filter(file => !fs.existsSync(path.join(ROOT, file))), [],
    'every declared runtime script must exist on disk');
});
