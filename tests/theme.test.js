// Theme choice: this phone only, applied in <head> before the first paint.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Theme = require('../src/theme.js');

const root = path.join(__dirname, '..');
const memory = (init) => {
  const m = { ...init };
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
};
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };

function fakeDoc() {
  const attrs = {};
  const meta = (media) => ({
    media, content: '',
    getAttribute(k) { return k === 'media' ? this.media : this.content; },
    setAttribute(k, v) { if (k === 'content') this.content = v; },
  });
  const metas = [meta('(prefers-color-scheme: light)'), meta('(prefers-color-scheme: dark)')];
  const scheme = meta(null);
  return {
    attrs, metas, scheme,
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } },
    querySelectorAll: (sel) => (sel === 'meta[name="theme-color"]' ? metas : []),
    querySelector: (sel) => (sel === 'meta[name="color-scheme"]' ? scheme : null),
  };
}

test('read gives the stored choice, else "system" (nothing stored, junk, or blocked storage)', () => {
  assert.equal(Theme.read(memory({ 'shiftlog-theme': 'dark' })), 'dark');
  assert.equal(Theme.read(memory({ 'shiftlog-theme': 'light' })), 'light');
  assert.equal(Theme.read(memory({ 'shiftlog-theme': 'system' })), 'system');
  assert.equal(Theme.read(memory({})), 'system');
  assert.equal(Theme.read(memory({ 'shiftlog-theme': 'purple' })), 'system');
  assert.equal(Theme.read(blocked), 'system');
});

test('save stores the choice under shiftlog-theme and never throws', () => {
  const s = memory({});
  Theme.save('dark', s);
  assert.equal(s.m['shiftlog-theme'], 'dark');
  Theme.save('nonsense', s);
  assert.equal(s.m['shiftlog-theme'], 'system');
  assert.doesNotThrow(() => Theme.save('dark', blocked));
});

test('apply sets data-theme, both theme-color tags and color-scheme for each choice', () => {
  const d = fakeDoc();
  assert.equal(Theme.apply(d, 'dark'), 'dark');
  assert.equal(d.attrs['data-theme'], 'dark');
  assert.deepEqual(d.metas.map((m) => m.content), ['#0a0e13', '#0a0e13']);
  assert.equal(d.scheme.content, 'dark');
  Theme.apply(d, 'light');
  assert.equal(d.attrs['data-theme'], 'light');
  assert.deepEqual(d.metas.map((m) => m.content), ['#e9ecef', '#e9ecef']);
  assert.equal(d.scheme.content, 'light');
  assert.equal(Theme.apply(d, 'system'), 'system');
  assert.ok(!('data-theme' in d.attrs));
  assert.deepEqual(d.metas.map((m) => m.content), ['#e9ecef', '#0a0e13']);
  assert.equal(d.scheme.content, 'light dark');
  assert.equal(Theme.apply(d, undefined), 'system');
});

test('the theme colours are the --bg tokens in styles.css, and the manifest splash is the dark one', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const light = /^:root\s*\{[^}]*--bg:\s*(#[0-9a-f]{6})/mi.exec(css)[1];
  const dark = /:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*(#[0-9a-f]{6})/i.exec(css)[1];
  assert.deepEqual(Theme.BG, { light, dark });
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.background_color, Theme.BG.dark);
  assert.equal(m.theme_color, '#142231');
});
