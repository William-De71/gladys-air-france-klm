// -----------------------------------------------------------------------------
// When to read a followed flight again, and the daily budget of calls.
//
// The free plan of the portal allows 100 calls a day: a flight is read often
// only when it matters. About 30 calls for a flight on its day:
//   not published yet    every 12 h (more than 2 days ahead), else every 2 h
//   more than 24 h ahead every 6 h
//   24 h to 6 h ahead    every 2 h
//   6 h to 2 h ahead     every 30 min
//   last 2 h, late, in the air   every 15 min (30 min for a long flight
//                        until 1 h before its landing)
//   arrived, cancelled   never again
// A flight still not landed 12 h after its arrival time (or departure time),
// or not published the day after its date, is not read any more.
//
// The budget counts the calls of the day (UTC). The automatic reads stop
// RESERVE calls before the limit, so a scene action or a test still works.
// -----------------------------------------------------------------------------

import { instantOf, daysBetween, MINUTE_MS, HOUR_MS } from './time.js';
import { isFinished } from './flights.js';

const RESERVE = 5;
const DEFAULT_LIMIT = 100;
const LIMIT_RANGE = { min: 10, max: 100000 };
const GIVE_UP_MS = 12 * HOUR_MS;

/**
 * @description The delay before the next reading of a flight.
 * @param {object|null} snapshot - Its last snapshot, null when never read.
 * @param {object} followed - The followed flight (`date`).
 * @param {object} clock - `{ now, today }`.
 * @returns {number|null} Milliseconds, null when it is not read any more.
 */
function nextReadDelay(snapshot, followed, { now, today }) {
  if (!snapshot || snapshot.status === 'not_found') {
    const days = daysBetween(today, followed.date);
    if (days < -1) {
      return null;
    }
    return days > 2 ? 12 * HOUR_MS : 2 * HOUR_MS;
  }
  if (isFinished(snapshot)) {
    return null;
  }
  const departure = instantOf(snapshot.departure.best) ?? instantOf(snapshot.departure.scheduled);
  const arrival = instantOf(snapshot.arrival.best) ?? instantOf(snapshot.arrival.scheduled);
  const end = arrival ?? departure;
  if (end !== null && now > end + GIVE_UP_MS) {
    return null;
  }
  if (snapshot.status === 'departed' || snapshot.status === 'diverted') {
    return arrival !== null && arrival - now > HOUR_MS ? 30 * MINUTE_MS : 15 * MINUTE_MS;
  }
  if (departure === null) {
    return 2 * HOUR_MS;
  }
  const ahead = departure - now;
  if (ahead > 24 * HOUR_MS) {
    return 6 * HOUR_MS;
  }
  if (ahead > 6 * HOUR_MS) {
    return 2 * HOUR_MS;
  }
  if (ahead > 2 * HOUR_MS) {
    return 30 * MINUTE_MS;
  }
  return 15 * MINUTE_MS;
}

/**
 * @description Read the daily limit of the configuration.
 * @param {unknown} raw - The value.
 * @returns {number} Within LIMIT_RANGE, DEFAULT_LIMIT when invalid.
 */
function readLimit(raw) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(LIMIT_RANGE.max, Math.max(LIMIT_RANGE.min, Math.round(value)));
}

/**
 * @description The budget of calls of the day.
 * @param {object} state - `{ day, used }`, kept in /data (changed in place).
 * @param {object} options - `{ now, limit }`: `limit` is a function.
 * @returns {object} `{ count, used, left, allows }`.
 */
function createBudget(state, { now, limit }) {
  const roll = () => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (state.day !== day) {
      state.day = day;
      state.used = 0;
    }
  };
  return {
    /** Count one call. */
    count() {
      roll();
      state.used = (Number(state.used) || 0) + 1;
    },
    used() {
      roll();
      return Number(state.used) || 0;
    },
    left() {
      roll();
      return Math.max(0, limit() - (Number(state.used) || 0));
    },
    /**
     * @param {boolean} [automatic] - An automatic reading keeps the reserve.
     * @returns {boolean} Whether a call may be made.
     */
    allows(automatic = true) {
      roll();
      const used = Number(state.used) || 0;
      return used < limit() - (automatic ? Math.min(RESERVE, limit() - 1) : 0);
    },
  };
}

export { RESERVE, DEFAULT_LIMIT, LIMIT_RANGE, GIVE_UP_MS, nextReadDelay, readLimit, createBudget };
