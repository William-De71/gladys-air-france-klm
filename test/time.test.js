import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  localDate,
  localTime,
  isDate,
  addDays,
  daysBetween,
  instantOf,
  airportClock,
  durationMinutes,
  parseDateInput,
} from '../src/time.js';

test('durations of the API, in whole minutes', () => {
  assert.equal(durationMinutes('PT17M'), 17);
  assert.equal(durationMinutes('PT-1M'), -1);
  assert.equal(durationMinutes('-PT5M'), -5);
  assert.equal(durationMinutes('PT1H5M'), 65);
  assert.equal(durationMinutes('P1DT2H'), 1560);
  assert.equal(durationMinutes('PT0S'), 0);
  assert.equal(durationMinutes('PT-0S'), 0);
  assert.equal(durationMinutes('PT90S'), 2);
  for (const bad of [null, undefined, '', 'P', 'PT', '17', 'later']) {
    assert.equal(durationMinutes(bad), null, String(bad));
  }
});

test('times of the API: the local time of the airport, and the instant', () => {
  const text = '2025-05-19T05:30:00.000-10:00';
  assert.deepEqual(airportClock(text), { date: '2025-05-19', time: '05:30' });
  assert.equal(instantOf(text), Date.parse('2025-05-19T15:30:00Z'));
  assert.equal(airportClock('soon'), null);
  assert.equal(instantOf(''), null);
  assert.equal(instantOf('not a date'), null);
});

test('dates and times of the instance timezone', () => {
  const instant = Date.parse('2026-10-30T23:30:00Z');
  assert.equal(localDate(instant, 'Europe/Paris'), '2026-10-31');
  assert.equal(localDate(instant, 'America/New_York'), '2026-10-30');
  assert.equal(localTime(instant, 'Europe/Paris'), '00:30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
});

test('typed dates: ISO, day first, words of the four languages, +n', () => {
  const today = '2026-10-30';
  assert.equal(parseDateInput('2026-11-06', today), '2026-11-06');
  assert.equal(parseDateInput('06/11/2026', today), '2026-11-06');
  assert.equal(parseDateInput('6.11.26', today), '2026-11-06');
  assert.equal(parseDateInput('6/11', today), '2026-11-06');
  // Yesterday still counts (a flight of last night); before, next year.
  assert.equal(parseDateInput('29/10', today), '2026-10-29');
  assert.equal(parseDateInput('28/10', today), '2027-10-28');
  for (const word of ['tomorrow', 'demain', 'morgen', 'mañana']) {
    assert.equal(parseDateInput(word, today), '2026-10-31', word);
  }
  for (const word of ['today', 'aujourd’hui', 'heute', 'hoy']) {
    assert.equal(parseDateInput(word, today), today, word);
  }
  assert.equal(parseDateInput('+3', today), '2026-11-02');
  assert.equal(parseDateInput('', today), null);
  assert.equal(parseDateInput('31/02', today), undefined);
  assert.equal(parseDateInput('next week', today), undefined);
});
