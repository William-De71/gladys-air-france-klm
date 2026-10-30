// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per change of a followed flight, at most one of each
// per reading):
//   - `status_changed`  the status changed (delayed, in flight, landed,
//                       cancelled, diverted…). A flight seen for the first
//                       time, or published after "not published yet", only
//                       fires when it is already delayed, cancelled or
//                       diverted: "on time" is no news;
//   - `delay_changed`   the delay that matters (departure until take-off,
//                       arrival after) moved by DELAY_STEP minutes or more
//                       since the last event;
//   - `gate_changed`    the departure gate is announced, or changes.
// The first reading of a flight is a baseline. `seen` (in /data) remembers
// what the triggers last saw, so a restart neither fires again nor misses a
// change. A scene action or a widget never fires an event.
// -----------------------------------------------------------------------------

import {
  t,
  statusText,
  delayText,
  routeText,
  departureText,
  arrivalText,
  clockText,
  terminalText,
  numericDate,
} from './i18n.js';
import { flightLabel, currentDelay, DELAY_MINUTES } from './flights.js';

const TRIGGERS = {
  STATUS_CHANGED: 'status_changed',
  DELAY_CHANGED: 'delay_changed',
  GATE_CHANGED: 'gate_changed',
};
// A delay that moves by less is not news.
const DELAY_STEP = DELAY_MINUTES;
const NEWS_ON_FIRST_SIGHT = new Set(['delayed', 'cancelled', 'diverted']);
const DATA_TEXT_MAX = 1000;

const FLIGHT_OUTPUTS = [
  'found',
  'status',
  'status_text',
  'route',
  'departure_airport',
  'arrival_airport',
  'departure_time',
  'departure_scheduled',
  'departure_delay',
  'arrival_time',
  'arrival_scheduled',
  'arrival_delay',
  'terminal',
  'gate',
  'baggage_belt',
  'aircraft',
  'reason',
  'summary',
];

/**
 * @description What the triggers remember of a snapshot.
 * @param {object} snapshot - A snapshot.
 * @param {number|null} notifiedDelay - The delay of the last event.
 * @returns {object} `{ status, delay, gate }`.
 */
const memoryOf = (snapshot, notifiedDelay) => ({
  status: snapshot.status,
  delay: notifiedDelay,
  gate: snapshot.departure?.gate ?? '',
});

/**
 * @description The changes between what the triggers saw and a new snapshot.
 * @param {object|null} previous - `{ status, delay, gate }`, null for a baseline.
 * @param {object} snapshot - The new snapshot.
 * @returns {{ changes: object[], memory: object }} The events to fire and
 * what to remember.
 */
function detectChanges(previous, snapshot) {
  const delay = currentDelay(snapshot);
  if (!previous) {
    return { changes: [], memory: memoryOf(snapshot, delay) };
  }
  const changes = [];
  // Published after "not published yet": the gate it already has is no news.
  const firstSight = previous.status === 'not_found';
  if (previous.status !== snapshot.status) {
    if (!firstSight || NEWS_ON_FIRST_SIGHT.has(snapshot.status)) {
      changes.push({ key: TRIGGERS.STATUS_CHANGED, previous: previous.status });
    }
  }
  let notified = previous.delay ?? null;
  if (snapshot.status !== 'cancelled' && snapshot.status !== 'not_found' && delay !== null) {
    if (notified === null) {
      // The first known delay: news only when the flight is late already.
      if (delay >= DELAY_STEP) {
        changes.push({ key: TRIGGERS.DELAY_CHANGED, previous: 0 });
      }
      notified = delay;
    } else if (Math.abs(delay - notified) >= DELAY_STEP) {
      changes.push({ key: TRIGGERS.DELAY_CHANGED, previous: notified });
      notified = delay;
    }
  }
  const gate = snapshot.departure?.gate ?? '';
  if (
    gate &&
    gate !== previous.gate &&
    !firstSight &&
    !['departed', 'arrived'].includes(snapshot.status)
  ) {
    changes.push({ key: TRIGGERS.GATE_CHANGED, previous: previous.gate ?? '' });
  }
  return { changes, memory: memoryOf(snapshot, notified) };
}

/**
 * @description The summary of a snapshot, in one or two sentences.
 * @param {object} followed - The followed flight.
 * @param {object} snapshot - Its snapshot.
 * @param {string} language - The language.
 * @returns {string} The summary.
 */
function summaryText(followed, snapshot, language) {
  if (snapshot.status === 'not_found') {
    return t('summaryNotFound', language, {
      flight: flightLabel(followed),
      date: numericDate(followed.date, language),
    });
  }
  const summary = t('summary', language, {
    flight: flightLabel(followed),
    route: routeText(snapshot, { cities: true }),
    status: statusText(snapshot.status, language).toLowerCase(),
    departure: departureText(snapshot, language) || '?',
    arrival: arrivalText(snapshot, language) || '?',
  });
  const text = snapshot.reason
    ? t('summaryReason', language, { summary, reason: snapshot.reason })
    : summary;
  return text.slice(0, DATA_TEXT_MAX);
}

/**
 * @description The variables every event carries.
 * @param {object} options - `{ followed, snapshot, deviceId, language }`.
 * @returns {object} The flat payload.
 */
function baseData({ followed, snapshot, deviceId, language }) {
  return {
    flight: deviceId,
    flight_number: flightLabel(followed),
    date: followed.date,
    route: routeText(snapshot, { cities: true }),
    status: snapshot.status,
    status_text: statusText(snapshot.status, language),
    departure_time: clockText(snapshot.departure?.best),
    arrival_time: clockText(snapshot.arrival?.best, snapshot.departure?.best),
    gate: snapshot.departure?.gate ?? '',
  };
}

/**
 * @description The data of an event.
 * @param {object} change - `{ key, previous }` of detectChanges.
 * @param {object} options - `{ followed, snapshot, deviceId, language }`.
 * @returns {object} The flat payload.
 */
function eventData(change, { followed, snapshot, deviceId, language }) {
  const base = baseData({ followed, snapshot, deviceId, language });
  const route = routeText(snapshot);
  if (change.key === TRIGGERS.STATUS_CHANGED) {
    return {
      ...base,
      previous_status: change.previous,
      delay: currentDelay(snapshot) ?? 0,
      reason: snapshot.reason.slice(0, DATA_TEXT_MAX),
      summary: summaryText(followed, snapshot, language),
    };
  }
  if (change.key === TRIGGERS.DELAY_CHANGED) {
    const delay = currentDelay(snapshot) ?? 0;
    return {
      ...base,
      delay,
      previous_delay: change.previous,
      reason: snapshot.reason.slice(0, DATA_TEXT_MAX),
      summary: t('delaySummary', language, {
        flight: flightLabel(followed),
        route,
        delay: delayText(delay, language),
        previous: delayText(change.previous, language),
        departure: departureText(snapshot, language) || '?',
        arrival: arrivalText(snapshot, language) || '?',
      }).slice(0, DATA_TEXT_MAX),
    };
  }
  const terminal = snapshot.departure?.terminal
    ? ` (${terminalText(snapshot.departure.terminal, language)})`
    : '';
  return {
    ...base,
    previous_gate: change.previous,
    terminal: snapshot.departure?.terminal ?? '',
    summary: t(change.previous ? 'gateSummaryChanged' : 'gateSummary', language, {
      flight: flightLabel(followed),
      route,
      gate: snapshot.departure?.gate ?? '',
      previous: change.previous,
      terminal,
      time: base.departure_time || '?',
    }).slice(0, DATA_TEXT_MAX),
  };
}

/**
 * @description The outputs of the "Read a flight" scene actions.
 * @param {object} followed - `{ carrier, number, date }`.
 * @param {object} snapshot - Its snapshot.
 * @param {string} language - The language.
 * @returns {object} The outputs.
 */
function flightOutputs(followed, snapshot, language) {
  const found = snapshot.status !== 'not_found';
  return {
    found,
    status: snapshot.status,
    status_text: statusText(snapshot.status, language),
    route: routeText(snapshot, { cities: true }),
    departure_airport: snapshot.departure?.airport ?? '',
    arrival_airport: snapshot.arrival?.airport ?? '',
    departure_time: clockText(snapshot.departure?.best),
    departure_scheduled: clockText(snapshot.departure?.scheduled),
    departure_delay: snapshot.departure?.delay ?? 0,
    arrival_time: clockText(snapshot.arrival?.best, snapshot.departure?.best),
    arrival_scheduled: clockText(snapshot.arrival?.scheduled, snapshot.departure?.scheduled),
    arrival_delay: snapshot.arrival?.delay ?? 0,
    terminal: snapshot.departure?.terminal ?? '',
    gate: snapshot.departure?.gate ?? '',
    baggage_belt: snapshot.arrival?.belt ?? '',
    aircraft: snapshot.aircraft?.type ?? '',
    reason: snapshot.reason ?? '',
    summary: summaryText(followed, snapshot, language),
  };
}

/**
 * @description Keep only the declared keys.
 * @param {object} values - The values.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The values of those keys.
 */
const pick = (values, keys) => Object.fromEntries(keys.map((key) => [key, values[key]]));

export {
  TRIGGERS,
  DELAY_STEP,
  FLIGHT_OUTPUTS,
  detectChanges,
  summaryText,
  eventData,
  flightOutputs,
  pick,
};
