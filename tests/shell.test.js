const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('sw.js VERSION matches src/version.js APP_VERSION', () => {
  const { APP_VERSION } = require('../src/version.js');
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(/const VERSION = '([^']+)'/.exec(sw)[1], APP_VERSION);
});
test('every file in the offline SHELL list exists', () => {
  const list = JSON.parse(/const SHELL = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of list) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f);
  }
});
test('index.html loads the scripts in dependency order and links the manifest', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = ['src/version.js', 'src/calc.js', 'src/format.js', 'src/i18n.js', 'src/backup.js', 'src/store.js', 'src/app.js'];
  const pos = order.map((s) => html.indexOf('src="' + s + '"'));
  assert.ok(pos.every((p) => p > 0), 'all scripts present');
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs|jsdelivr|unpkg/);
});
test('styles.css uses only local fonts', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(css, /@font-face/);
});

// Android Chrome installs from the manifest; iOS Safari from the apple-touch-icon and meta tags.
function pngSize(file) {
  const b = fs.readFileSync(path.join(root, file));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', file + ' is not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
test('manifest has what Android Chrome needs to install the app under /shift-log/', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Shift Log');
  assert.ok(m.short_name && m.short_name.length <= 12, 'short_name fits under a launcher icon');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.id, './');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  const any = (m.icons || []).filter((i) => !i.purpose || i.purpose.split(' ').includes('any'));
  const maskable = (m.icons || []).filter((i) => i.purpose && i.purpose.split(' ').includes('maskable'));
  for (const size of [192, 512]) {
    const icon = any.find((i) => i.sizes === size + 'x' + size && i.type === 'image/png');
    assert.ok(icon, 'needs a ' + size + 'px PNG icon');
    assert.deepEqual(pngSize(icon.src), [size, size], icon.src + ' is really ' + size + 'px');
  }
  assert.ok(maskable.length > 0, 'needs a maskable icon for Android adaptive icons');
  for (const icon of maskable) {
    const [w, h] = pngSize(icon.src);
    assert.equal(icon.sizes, w + 'x' + h);
  }
  for (const icon of m.icons) assert.ok(sw.includes("'" + icon.src + "'"), icon.src + ' is in the offline SHELL');
});
test('index.html has the iOS and Android home-screen tags', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180.png">/);
  assert.deepEqual(pngSize('icons/icon-180.png'), [180, 180]);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)">/);
  assert.match(html, /viewport-fit=cover/);
});
test('index.html declares light and dark so the first paint matches the phone theme (no white flash in dark mode)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
});

test('the theme is applied in <head> before the stylesheet loads, so the first paint has the right theme', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const lib = head.indexOf('<script src="src/theme.js"></script>');
  const call = head.indexOf('<script>Theme.apply(document, Theme.read());</script>');
  const css = head.indexOf('<link rel="stylesheet" href="styles.css">');
  assert.ok(lib > 0, 'theme.js is loaded in <head>');
  assert.ok(call > lib, 'the choice is applied right after');
  assert.ok(css > call, 'before the stylesheet');
  assert.ok(head.lastIndexOf('name="theme-color"') < lib, 'the theme-color tags exist when it runs');
  assert.ok(head.indexOf('name="color-scheme"') < lib, 'the color-scheme tag exists when it runs');
  assert.ok(sw.includes("'src/theme.js'"), 'theme.js is in the offline SHELL');
});
