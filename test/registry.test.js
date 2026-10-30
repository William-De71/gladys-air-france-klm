import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegistry,
  readFlightFields,
  parseFlights,
  RegistryError,
  MAX_FLIGHTS,
  FORGET_DAYS,
} from '../src/registry.js';
import { addDays } from '../src/time.js';

const TODAY = '2026-10-30';

/**
 * @description A registry on a fake setConfig, with predictable identifiers.
 * @returns {{ registry: object, saved: object[] }} The registry and the saved values.
 */
function setup() {
  const saved = [];
  let next = 0;
  const gladys = { setConfig: async (values) => saved.push(values) };
  const registry = createRegistry(gladys, {
    newId: () => (next++).toString(16).padStart(8, '0'),
  });
  return { registry, saved };
}

const failsWith = (fn, key) =>
  assert.throws(fn, (err) => err instanceof RegistryError && err.key === key);

test('the "Follow a flight" form', () => {
  assert.deepEqual(readFlightFields({ flight: 'af 1234', date: 'demain' }, TODAY), {
    carrier: 'AF',
    number: 1234,
    date: '2026-10-31',
    origin: null,
    destination: null,
  });
  assert.deepEqual(
    readFlightFields({ flight: 'AF28', date: '19/05/2027', origin: 'lax', destination: '' }, TODAY),
    { carrier: 'AF', number: 28, date: '2027-05-19', origin: 'LAX', destination: null },
  );
  failsWith(
    () => readFlightFields({ flight: 'Air France', date: 'today' }, TODAY),
    'errorFlightNumber',
  );
  failsWith(() => readFlightFields({ flight: 'AF1', date: 'soon' }, TODAY), 'errorDate');
  failsWith(() => readFlightFields({ flight: 'AF1', date: '' }, TODAY), 'errorDate');
  failsWith(() => readFlightFields({ flight: 'AF1', date: '2026-10-01' }, TODAY), 'errorDateRange');
  failsWith(() => readFlightFields({ flight: 'AF1', date: '2028-01-01' }, TODAY), 'errorDateRange');
  failsWith(
    () => readFlightFields({ flight: 'AF1', date: 'today', origin: 'Paris' }, TODAY),
    'errorAirport',
  );
  failsWith(
    () =>
      readFlightFields({ flight: 'AF1', date: 'today', origin: 'CDG', destination: 'cdg' }, TODAY),
    'errorAirport',
  );
});

test('add, find, refuse twice the same, remove, sorted by date', async () => {
  const { registry, saved } = setup();
  const later = await registry.add({
    carrier: 'KL',
    number: 1008,
    date: '2026-11-06',
    origin: null,
    destination: null,
  });
  const sooner = await registry.add({
    carrier: 'AF',
    number: 28,
    date: '2026-11-01',
    origin: null,
    destination: 'LAX',
  });
  assert.deepEqual(
    registry.list().map((flight) => flight.id),
    [sooner.id, later.id],
  );
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[1].flights[0], {
    id: '00000001',
    carrier: 'AF',
    number: 28,
    date: '2026-11-01',
    origin: null,
    destination: 'LAX',
  });
  assert.equal(registry.find('2').id, later.id);
  assert.equal(registry.find('#1').id, sooner.id);
  assert.equal(registry.find('kl1008').id, later.id);
  assert.equal(registry.find(later.id).id, later.id);
  failsWith(() => registry.find('AF999'), 'errorFlightUnknown');
  failsWith(() => registry.find('7'), 'errorFlightUnknown');
  failsWith(() => registry.find(''), 'errorFlightMissing');
  await assert.rejects(
    registry.add({
      carrier: 'AF',
      number: 28,
      date: '2026-11-01',
      origin: null,
      destination: 'LAX',
    }),
    (err) => err.key === 'errorFlightExists',
  );
  await registry.remove(sooner.id);
  assert.deepEqual(
    registry.list().map((flight) => flight.id),
    [later.id],
  );
});

test('ten flights at most, and the old ones are dropped', async () => {
  const { registry, saved } = setup();
  for (let i = 0; i < MAX_FLIGHTS; i += 1) {
    await registry.add({
      carrier: 'AF',
      number: 100 + i,
      date: addDays(TODAY, i - 5),
      origin: null,
      destination: null,
    });
  }
  await assert.rejects(
    registry.add({ carrier: 'AF', number: 1, date: TODAY, origin: null, destination: null }),
    (err) => err.key === 'errorTooManyFlights',
  );
  const writes = saved.length;
  const dropped = await registry.prune(TODAY);
  // Dates TODAY-5 and TODAY-4 are more than FORGET_DAYS behind.
  assert.equal(FORGET_DAYS, 3);
  assert.deepEqual(
    dropped.map((flight) => flight.number),
    [100, 101],
  );
  assert.equal(registry.list().length, MAX_FLIGHTS - 2);
  assert.equal(saved.length, writes + 1);
  await registry.prune(TODAY);
  assert.equal(saved.length, writes + 1, 'nothing to drop: nothing written');
});

test('the stored flights are checked when read', () => {
  const good = {
    id: '0000000a',
    carrier: 'AF',
    number: 28,
    date: '2026-11-01',
    origin: null,
    destination: 'LAX',
  };
  assert.deepEqual(parseFlights([good]), [good]);
  assert.deepEqual(parseFlights(JSON.stringify([good, good])), [good]);
  assert.deepEqual(parseFlights('not json'), []);
  for (const bad of [
    { ...good, id: 'x' },
    { ...good, carrier: 'Air France' },
    { ...good, number: '28' },
    { ...good, date: '2026-02-30' },
    { ...good, origin: 'Paris' },
  ]) {
    assert.deepEqual(parseFlights([bad]), [], JSON.stringify(bad));
  }
});
