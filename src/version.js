/* The app version. Bump it on every release; sw.js must carry the same value. */
(function (root) {
  const APP_VERSION = '1.0.0';
  if (typeof module === 'object' && module.exports) module.exports = { APP_VERSION };
  else root.APP_VERSION = APP_VERSION;
})(typeof self !== 'undefined' ? self : this);
