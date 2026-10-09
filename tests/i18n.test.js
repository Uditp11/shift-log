const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');

const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

test('en and de have exactly the same keys', () => {
  assert.deepEqual(Object.keys(I.STRINGS.de).sort(), Object.keys(I.STRINGS.en).sort());
});
test('no empty strings in either language', () => {
  for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(I.STRINGS[lang])) assert.ok(typeof v === 'string' && v.trim(), lang + ':' + k);
});
test('placeholders match between languages', () => {
  for (const k of Object.keys(I.STRINGS.en)) assert.equal(vars(I.STRINGS.de[k]), vars(I.STRINGS.en[k]), k);
});
test('t fills variables and follows the language', () => {
  I.setLang('en');
  assert.equal(I.t('when.daysAgo', { n: 3 }), '3 days ago');
  I.setLang('de');
  assert.equal(I.t('when.daysAgo', { n: 3 }), 'vor 3 Tagen');
  assert.equal(I.getLang(), 'de');
  I.setLang('fr');
  assert.equal(I.getLang(), 'en');
});
test('unknown key returns the key itself (visible in testing, never blank)', () => {
  assert.equal(I.t('no.such.key'), 'no.such.key');
});
test('detectLang: German phones get de, everything else en', () => {
  assert.equal(I.detectLang('de-DE'), 'de');
  assert.equal(I.detectLang('de'), 'de');
  assert.equal(I.detectLang('en-GB'), 'en');
  assert.equal(I.detectLang(undefined), 'en');
});
test('Android has its own Add-to-Home-screen text in both languages', () => {
  for (const lang of ['en', 'de']) {
    assert.match(I.STRINGS[lang]['ob.home.stepsAndroid'], /Chrome/, lang);
    assert.ok(I.STRINGS[lang]['ob.home.whyAndroid'], lang);
  }
});
test('only the iPhone install keys name iPhone, iOS, Safari or iCloud alone', () => {
  const iosOnly = ['ob.home.steps', 'ob.home.why'];
  for (const lang of ['en', 'de']) {
    for (const [k, v] of Object.entries(I.STRINGS[lang])) {
      if (iosOnly.includes(k)) continue;
      assert.doesNotMatch(v, /iPhone|iOS|Safari/, lang + ':' + k);
      if (/iCloud/.test(v)) assert.match(v, /Google Drive/, lang + ':' + k);
    }
  }
});
