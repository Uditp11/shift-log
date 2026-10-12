/* Theme choice from Settings: 'system' (follow the phone), 'light' or 'dark'. Kept on this phone only
 * (localStorage 'shiftlog-theme'), never in stored data or backups. index.html loads this file in <head>,
 * before styles.css, and applies the choice there, so the first paint already has the right theme. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'shiftlog-theme';
  const CHOICES = ['system', 'light', 'dark'];
  // The --bg of each theme in styles.css (tests/theme.test.js keeps them equal): browser bar and splash colour.
  const BG = { light: '#e9ecef', dark: '#0a0e13' };

  const normalize = (v) => (CHOICES.includes(v) ? v : 'system');
  // Private tabs and blocked storage throw on access: the app then follows the phone.
  function read(storage) {
    try { return normalize((storage || self.localStorage).getItem(KEY)); } catch (e) { return 'system'; }
  }
  function save(choice, storage) {
    try { (storage || self.localStorage).setItem(KEY, normalize(choice)); } catch (e) { /* applies until the app closes */ }
  }
  function metaColors(choice) {
    return choice === 'light' || choice === 'dark' ? { light: BG[choice], dark: BG[choice] } : { light: BG.light, dark: BG.dark };
  }
  function apply(doc, choice) {
    choice = normalize(choice);
    if (choice === 'system') doc.documentElement.removeAttribute('data-theme');
    else doc.documentElement.setAttribute('data-theme', choice);
    const c = metaColors(choice);
    for (const m of doc.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', /dark/.test(m.getAttribute('media') || '') ? c.dark : c.light);
    const scheme = doc.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', choice === 'system' ? 'light dark' : choice);
    return choice;
  }

  return { KEY, CHOICES, BG, normalize, read, save, metaColors, apply };
});
