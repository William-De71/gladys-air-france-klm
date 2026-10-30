import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFlightNumber,
  parseAirport,
  flightLabel,
  segmentOf,
  pickFlight,
  summarizeFlight,
  notFound,
  currentDelay,
  isFinished,
  cityOf,
} from '../src/flights.js';
import { FLIGHTS, flight, beforeTakeOff } from './helpers/fixtures.js';

const followed = (fields) => ({ origin: null, destination: null, date: '2025-05-18', ...fields });
const summary = (fields, list = FLIGHTS) => {
  const wanted = followed(fields);
  const found = pickFlight(list, wanted);
  assert.ok(found, JSON.stringify(fields));
  return summarizeFlight(found, wanted);
};

test('flight numbers as people type them', () => {
  assert.deepEqual(parseFlightNumber('AF1234'), { carrier: 'AF', number: 1234 });
  assert.deepEqual(parseFlightNumber(' af 0028 '), { carrier: 'AF', number: 28 });
  assert.deepEqual(parseFlightNumber('KL-1008'), { carrier: 'KL', number: 1008 });
  assert.deepEqual(parseFlightNumber('A5 3021'), { carrier: 'A5', number: 3021 });
  assert.deepEqual(parseFlightNumber('6E 21'), { carrier: '6E', number: 21 });
  for (const bad of ['', 'AF', '1234', 'AF0', 'AF12345', 'AIRFRANCE 12', '12 34', null]) {
    assert.equal(parseFlightNumber(bad), null, String(bad));
  }
  assert.equal(flightLabel({ carrier: 'AF', number: 28 }), 'AF28');
  assert.equal(parseAirport(' cdg '), 'CDG');
  assert.equal(parseAirport(''), null);
  assert.equal(parseAirport('Paris'), undefined);
});

test('a flight with stops: the whole flight, or the part the passenger flies', () => {
  const af28 = flight('20250518+AF+0028');
  assert.equal(segmentOf(af28, {}).length, 2);
  assert.equal(segmentOf(af28, { origin: 'LAX' }).length, 1);
  assert.equal(segmentOf(af28, { destination: 'LAX' }).length, 1);
  assert.equal(segmentOf(af28, { origin: 'PPT' }), null);
  assert.equal(segmentOf(af28, { origin: 'LAX', destination: 'LAX' }), null);
  const whole = summary({ carrier: 'AF', number: 28 });
  assert.equal(whole.departure.airport, 'CDG');
  assert.equal(whole.arrival.airport, 'PPT');
  assert.equal(whole.stops, 1);
  const first = summary({ carrier: 'AF', number: 28, destination: 'LAX' });
  assert.equal(first.arrival.airport, 'LAX');
  assert.equal(first.arrival.delay, 10);
  assert.equal(first.status, 'arrived');
  // Boarding at the stop, with the date of the own leg (the day after).
  const second = summary({ carrier: 'AF', number: 28, origin: 'LAX', date: '2025-05-19' });
  assert.equal(second.departure.airport, 'LAX');
  assert.equal(second.departure.gate, '204');
  assert.equal(second.departure.delay, 11);
});

test('the flight of the date and the airline, not another one', () => {
  assert.equal(
    pickFlight(FLIGHTS, followed({ carrier: 'AF', number: 28, date: '2025-05-20' })),
    null,
  );
  assert.equal(pickFlight(FLIGHTS, followed({ carrier: 'KL', number: 28 })), null);
  assert.equal(pickFlight([], followed({ carrier: 'AF', number: 28 })), null);
  assert.equal(pickFlight(undefined, followed({ carrier: 'AF', number: 28 })), null);
});

test('a landed flight: times, delays, gate, belt, aircraft, public reason', () => {
  const kl835 = summary({ carrier: 'KL', number: 835 });
  assert.equal(kl835.status, 'arrived');
  assert.equal(kl835.departure.best, '2025-05-18T21:07:00.000+02:00');
  assert.equal(kl835.departure.scheduled, '2025-05-18T20:50:00.000+02:00');
  assert.equal(kl835.departure.delay, 17);
  assert.equal(kl835.departure.gate, 'E07');
  assert.equal(kl835.departure.terminal, '02');
  assert.equal(kl835.arrival.airport, 'DPS');
  assert.equal(kl835.arrival.delay, 5);
  assert.equal(kl835.aircraft.type, 'BOEING 777-300ER');
  assert.equal(kl835.reason, 'This flight was delayed due to operational issues.');
  assert.equal(isFinished(kl835), true);
  const af27 = summary({ carrier: 'AF', number: 27 });
  assert.equal(af27.arrival.belt, '33');
  assert.equal(af27.arrival.terminal, '2E');
  assert.equal(af27.departure.delay, -5);
});

test('cancelled, in flight, on time and delayed', () => {
  const kl807 = summary({ carrier: 'KL', number: 807 });
  assert.equal(kl807.status, 'cancelled');
  assert.match(kl807.reason, /cancelled/);
  assert.equal(isFinished(kl807), true);
  // Corsair to La Réunion: took off, not landed yet.
  const ss774 = summary({ carrier: 'SS', number: 774, destination: 'RUN' });
  assert.equal(ss774.status, 'departed');
  assert.equal(currentDelay(ss774), 9, 'the arrival delay once in the air');
  const early = beforeTakeOff('20250518+KL+0835');
  assert.equal(summary({ carrier: 'KL', number: 835 }, [early]).status, 'on_time');
  early.flightLegs[0].departureInformation.times.latestPublished = '2025-05-18T21:30:00.000+02:00';
  const late = summary({ carrier: 'KL', number: 835 }, [early]);
  assert.equal(late.status, 'delayed');
  assert.equal(late.departure.delay, 40);
  assert.equal(currentDelay(late), 40);
  early.flightLegs[0].departureInformation.times.latestPublished = '2025-05-18T21:00:00.000+02:00';
  assert.equal(summary({ carrier: 'KL', number: 835 }, [early]).status, 'on_time', '10 min');
  early.flightLegs[0].irregularity.divertedTo = 'SIN';
  assert.equal(summary({ carrier: 'KL', number: 835 }, [early]).status, 'diverted');
});

test('a partner flight whose leg statuses say "ARRIVED" before take-off is on time', () => {
  const qf = clonePartner();
  assert.equal(summary({ carrier: 'QF', number: 2 }, [qf]).status, 'on_time');
});

/**
 * @description A Qantas flight as the API served it on 18 May 2025, before
 * its take-off: the leg says ARRIVED, the flight ON_TIME, no actual time.
 * @returns {object} The flight.
 */
function clonePartner() {
  const copy = beforeTakeOff('20250518+KL+0835');
  copy.id = '20250518+QF+0002';
  copy.airline = { code: 'QF', name: 'QANTAS AIRWAYS LTD' };
  copy.flightNumber = 2;
  for (const leg of copy.flightLegs) {
    leg.legStatusPublic = 'ARRIVED';
    leg.publishedStatus = 'DELAYED_DEPARTURE';
  }
  return copy;
}

test('a flight not published yet, and the names of the cities', () => {
  const missing = notFound(followed({ carrier: 'AF', number: 1234, origin: 'CDG' }));
  assert.equal(missing.status, 'not_found');
  assert.equal(missing.departure.airport, 'CDG');
  assert.equal(currentDelay(missing), null);
  assert.equal(isFinished(missing), false);
  assert.equal(cityOf({ city: { name: 'PARIS' } }), 'Paris');
  assert.equal(cityOf({ city: { name: "SAINT-DENIS DE L'ILE" } }), "Saint-Denis De L'Ile");
  assert.equal(cityOf({ city: { nameLangTranl: 'Los Angeles' } }), 'Los Angeles');
  assert.equal(cityOf(undefined), '');
});
