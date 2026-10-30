import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectChanges,
  eventData,
  flightOutputs,
  summaryText,
  TRIGGERS,
  FLIGHT_OUTPUTS,
} from '../src/events.js';
import { summarizeFlight, notFound } from '../src/flights.js';
import { beforeTakeOff, flight } from './helpers/fixtures.js';

const followed = {
  id: '0000000a',
  carrier: 'KL',
  number: 835,
  date: '2025-05-18',
  origin: null,
  destination: null,
};
const DEVICE = 'ext:air-france-klm:flight:0000000a';

/**
 * @description KL 835 before take-off, changed by a function.
 * @param {Function} [change] - `(flight) => void`.
 * @returns {object} Its snapshot.
 */
function upcoming(change = () => {}) {
  const raw = beforeTakeOff('20250518+KL+0835');
  change(raw);
  return summarizeFlight(raw, followed);
}
const departureTimes = (raw) => raw.flightLegs[0].departureInformation.times;
const keys = (result) => result.changes.map((change) => change.key);

test('the first reading is a baseline', () => {
  const result = detectChanges(null, upcoming());
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.memory, { status: 'on_time', delay: 0, gate: 'E07' });
});

test('a delay: the status, then the delay when it moves by 15 minutes or more', () => {
  const memory = detectChanges(null, upcoming()).memory;
  const late = upcoming((raw) => {
    departureTimes(raw).latestPublished = '2025-05-18T21:30:00.000+02:00';
  });
  const first = detectChanges(memory, late);
  assert.deepEqual(keys(first), [TRIGGERS.STATUS_CHANGED, TRIGGERS.DELAY_CHANGED]);
  assert.equal(first.memory.delay, 40);
  const later = upcoming((raw) => {
    departureTimes(raw).latestPublished = '2025-05-18T21:40:00.000+02:00';
  });
  assert.deepEqual(keys(detectChanges(first.memory, later)), [], '+10 min: not news');
  const much = upcoming((raw) => {
    departureTimes(raw).latestPublished = '2025-05-18T22:00:00.000+02:00';
  });
  const third = detectChanges(first.memory, much);
  assert.deepEqual(keys(third), [TRIGGERS.DELAY_CHANGED]);
  const data = eventData(third.changes[0], {
    followed,
    snapshot: much,
    deviceId: DEVICE,
    language: 'fr',
  });
  assert.equal(data.delay, 70);
  assert.equal(data.previous_delay, 40);
  assert.match(
    data.summary,
    /^Vol KL835 AMS → DPS : retard \+70 min \(avant : \+40 min\)\. Départ 22:00 \(prévu 20:50\)/,
  );
});

test('the gate: announced, changed, never after take-off', () => {
  const noGate = upcoming((raw) => {
    raw.flightLegs[0].departureInformation.airport.places.gateNumber = [''];
  });
  const memory = detectChanges(null, noGate).memory;
  assert.equal(memory.gate, '');
  const announced = detectChanges(memory, upcoming());
  assert.deepEqual(keys(announced), [TRIGGERS.GATE_CHANGED]);
  const data = eventData(announced.changes[0], {
    followed,
    snapshot: upcoming(),
    deviceId: DEVICE,
    language: 'en',
  });
  assert.equal(data.previous_gate, '');
  assert.equal(data.summary, 'Flight KL835 AMS → DPS: gate E07 (T2), departure 20:50.');
  const moved = upcoming((raw) => {
    raw.flightLegs[0].departureInformation.airport.places.gateNumber = ['E09'];
  });
  const change = detectChanges(announced.memory, moved);
  assert.deepEqual(keys(change), [TRIGGERS.GATE_CHANGED]);
  const changed = eventData(change.changes[0], {
    followed,
    snapshot: moved,
    deviceId: DEVICE,
    language: 'fr',
  });
  assert.equal(
    changed.summary,
    'Vol KL835 AMS → DPS : changement de porte, E07 → E09 (T2), départ 20:50.',
  );
  const landed = summarizeFlight(flight('20250518+KL+0835'), followed);
  assert.ok(
    !keys(detectChanges({ ...announced.memory, gate: 'E01' }, landed)).includes(
      TRIGGERS.GATE_CHANGED,
    ),
  );
});

test('published after "not published yet": news only when already late, cancelled or diverted', () => {
  const memory = detectChanges(null, notFound(followed)).memory;
  assert.deepEqual(keys(detectChanges(memory, upcoming())), []);
  const cancelled = summarizeFlight(flight('20250518+KL+0807'), { ...followed, number: 807 });
  assert.deepEqual(keys(detectChanges(memory, cancelled)), [TRIGGERS.STATUS_CHANGED]);
});

test('landing fires the status, with the flat data of the trigger', () => {
  const memory = detectChanges(null, upcoming()).memory;
  const landed = summarizeFlight(flight('20250518+KL+0835'), followed);
  const result = detectChanges(memory, landed);
  assert.deepEqual(keys(result), [TRIGGERS.STATUS_CHANGED]);
  const data = eventData(result.changes[0], {
    followed,
    snapshot: landed,
    deviceId: DEVICE,
    language: 'fr',
  });
  assert.equal(data.flight, DEVICE);
  assert.equal(data.flight_number, 'KL835');
  assert.equal(data.status, 'arrived');
  assert.equal(data.previous_status, 'on_time');
  assert.equal(data.status_text, 'Arrivé');
  assert.equal(data.arrival_time, '19:30 (+1)');
  assert.equal(data.delay, 5);
  for (const [key, value] of Object.entries(data)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), key);
    assert.ok(typeof value !== 'string' || value.length <= 1000, key);
  }
});

test('the outputs of the scene actions, and the summaries', () => {
  const landed = summarizeFlight(flight('20250518+KL+0835'), followed);
  const outputs = flightOutputs(followed, landed, 'en');
  assert.deepEqual(Object.keys(outputs).sort(), [...FLIGHT_OUTPUTS].sort());
  assert.equal(outputs.found, true);
  assert.equal(outputs.departure_time, '21:07');
  assert.equal(outputs.departure_scheduled, '20:50');
  assert.equal(outputs.departure_delay, 17);
  assert.equal(outputs.aircraft, 'BOEING 777-300ER');
  assert.equal(
    summaryText(followed, notFound(followed), 'de'),
    'Flug KL835 vom 18.05.: von Air France-KLM noch nicht veröffentlicht.',
  );
  assert.equal(flightOutputs(followed, notFound(followed), 'fr').found, false);
});
