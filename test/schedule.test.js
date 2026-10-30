import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextReadDelay, readLimit, createBudget, RESERVE, DEFAULT_LIMIT } from '../src/schedule.js';
import { pickFlight, summarizeFlight, notFound } from '../src/flights.js';
import { beforeTakeOff, flight } from './helpers/fixtures.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const followed = {
  carrier: 'KL',
  number: 835,
  date: '2025-05-18',
  origin: null,
  destination: null,
};
// KL 835 leaves at 18:50 UTC.
const DEPARTURE = Date.parse('2025-05-18T18:50:00Z');
const upcoming = summarizeFlight(beforeTakeOff('20250518+KL+0835'), followed);
const at = (now) => nextReadDelay(upcoming, followed, { now, today: '2025-05-18' });

test('a flight is read more often as its departure gets closer', () => {
  assert.equal(at(DEPARTURE - 30 * HOUR), 6 * HOUR);
  assert.equal(at(DEPARTURE - 10 * HOUR), 2 * HOUR);
  assert.equal(at(DEPARTURE - 3 * HOUR), 30 * MINUTE);
  assert.equal(at(DEPARTURE - HOUR), 15 * MINUTE);
  // Late, not taken off yet.
  assert.equal(at(DEPARTURE + HOUR), 15 * MINUTE);
  // Gone for good: 12 hours after its arrival time.
  assert.equal(at(DEPARTURE + 40 * HOUR), null);
});

test('in the air: every 30 minutes, then 15 before landing; never again once landed or cancelled', () => {
  const ss774 = {
    carrier: 'SS',
    number: 774,
    date: '2025-05-18',
    origin: null,
    destination: 'RUN',
  };
  const inFlight = summarizeFlight(pickFlight([flight('20250518+SS+0774')], ss774), ss774);
  const landing = Date.parse('2025-05-19T06:09:00Z');
  const clock = (now) => ({ now, today: '2025-05-18' });
  assert.equal(nextReadDelay(inFlight, ss774, clock(landing - 5 * HOUR)), 30 * MINUTE);
  assert.equal(nextReadDelay(inFlight, ss774, clock(landing - 30 * MINUTE)), 15 * MINUTE);
  const landed = summarizeFlight(flight('20250518+KL+0835'), followed);
  assert.equal(nextReadDelay(landed, followed, clock(DEPARTURE)), null);
  const cancelled = { ...followed, number: 807 };
  const kl807 = summarizeFlight(flight('20250518+KL+0807'), cancelled);
  assert.equal(nextReadDelay(kl807, cancelled, clock(DEPARTURE)), null);
});

test('a flight not published yet: every 12 hours far ahead, every 2 hours close, given up the day after', () => {
  const later = { ...followed, date: '2025-05-25' };
  const clock = (today) => ({ now: Date.parse(`${today}T10:00:00Z`), today });
  assert.equal(nextReadDelay(notFound(later), later, clock('2025-05-18')), 12 * HOUR);
  assert.equal(nextReadDelay(null, later, clock('2025-05-23')), 2 * HOUR);
  assert.equal(nextReadDelay(notFound(later), later, clock('2025-05-26')), 2 * HOUR);
  assert.equal(nextReadDelay(notFound(later), later, clock('2025-05-27')), null);
});

test('the daily budget: counted per UTC day, a reserve for the actions', () => {
  assert.equal(readLimit(undefined), DEFAULT_LIMIT);
  assert.equal(readLimit('250'), 250);
  assert.equal(readLimit(3), 10);
  assert.equal(readLimit('many'), DEFAULT_LIMIT);
  const state = { day: '', used: 0 };
  let now = Date.parse('2025-05-18T23:00:00Z');
  const budget = createBudget(state, { now: () => now, limit: () => 10 });
  for (let i = 0; i < 10 - RESERVE; i += 1) {
    assert.equal(budget.allows(), true);
    budget.count();
  }
  assert.equal(budget.allows(), false, 'automatic readings keep the reserve');
  assert.equal(budget.allows(false), true);
  for (let i = 0; i < RESERVE; i += 1) {
    budget.count();
  }
  assert.equal(budget.allows(false), false);
  assert.equal(budget.left(), 0);
  assert.equal(state.used, 10);
  now += 2 * HOUR;
  assert.equal(budget.used(), 0, 'a new UTC day');
  assert.equal(state.day, '2025-05-19');
});
