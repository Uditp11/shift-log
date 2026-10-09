const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/format.js');

test('eur: German grouping and decimal comma, € in front', () => {
  assert.equal(F.eur(1234.56), '€ 1.234,56');
  assert.equal(F.eur(147.55125), '€ 147,55');
  assert.equal(F.eur(0), '€ 0,00');
  assert.equal(F.eur(1234.565), '€ 1.234,57');
});
test('eur: negatives use a real minus; tiny negatives show as zero', () => {
  assert.equal(F.eur(-12), '−€ 12,00');
  assert.equal(F.eur(-0.001), '€ 0,00');
});
test('signed formats', () => {
  assert.equal(F.sEur(5), '+€ 5,00');
  assert.equal(F.sEur(-891.52431), '−€ 891,52');
  assert.equal(F.sEur(0), '±€ 0,00');
  assert.equal(F.sHrs(-58.155532), '−58,16 h');
  assert.equal(F.hrs(29.25), '29,25 h');
  assert.equal(F.n2(-3.5), '−3,50');
});
test('dates: dm, dmy, weekday and month names per language', () => {
  assert.equal(F.dm('2026-10-05'), '05.10.');
  assert.equal(F.dmy('2026-10-05'), '05.10.2026');
  assert.equal(F.wd('2026-10-05', 'en'), 'Mon');
  assert.equal(F.wd('2026-10-05', 'de'), 'Mo');
  assert.equal(F.wd('2026-10-11', 'de'), 'So');
  assert.equal(F.monthName('2026-10', 'en'), 'October 2026');
  assert.equal(F.monthName('2026-03', 'de'), 'März 2026');
  assert.equal(F.monthShort('2026-12', 'de'), 'Dez');
});
test('normTime: accepts 2200, 22, 6:30, 22.00; rejects 25:00 and text', () => {
  assert.equal(F.normTime('2200'), '22:00');
  assert.equal(F.normTime('22'), '22:00');
  assert.equal(F.normTime('6:30'), '06:30');
  assert.equal(F.normTime('630'), '06:30');
  assert.equal(F.normTime('22.00'), '22:00');
  assert.equal(F.normTime('24:00'), '24:00');
  assert.equal(F.normTime(''), null);
  assert.equal(F.normTime('25:00'), null);
  assert.equal(F.normTime('abc'), null);
});
test('parseNum: German and English decimals, blank is null, junk is NaN', () => {
  assert.equal(F.parseNum('1.234,56'), 1234.56);
  assert.equal(F.parseNum('87,41'), 87.41);
  assert.equal(F.parseNum('15.33'), 15.33);
  assert.equal(F.parseNum('€ 1.436,70'), 1436.7);
  assert.equal(F.parseNum('−58,16'), -58.16);
  assert.equal(F.parseNum(''), null);
  assert.ok(Number.isNaN(F.parseNum('abc')));
});
test('numIn: number to German input text', () => {
  assert.equal(F.numIn(15.33), '15,33');
  assert.equal(F.numIn(null), '');
});
test('todayStr uses the local date of the given Date', () => {
  assert.equal(F.todayStr(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
});

test('daysAgo counts local calendar days, not 24-hour blocks', () => {
  const now = new Date(2026, 9, 9, 0, 30);
  assert.equal(F.daysAgo(new Date(2026, 9, 9, 0, 10).toISOString(), now), 0);
  assert.equal(F.daysAgo(new Date(2026, 9, 8, 23, 50).toISOString(), now), 1);
  assert.equal(F.daysAgo(new Date(2026, 9, 1, 12, 0).toISOString(), now), 8);
});
