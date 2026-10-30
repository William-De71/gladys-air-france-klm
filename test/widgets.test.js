import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, DEVICE_FEATURE_CATEGORIES } from '@gladysassistant/integration-sdk';

import { buildFlightWidget, buildFlightsWidget, delayColor } from '../src/widgets.js';
import { buildFlightDevice, buildFlightStates, flightIdOf, DELAY_RANGE } from '../src/device.js';
import { summarizeFlight, notFound, pickFlight } from '../src/flights.js';
import { LANGUAGES } from '../src/i18n.js';
import { FLIGHTS, beforeTakeOff, fakeGladys, NOW, TIME_ZONE } from './helpers/fixtures.js';

const make = (carrier, number, extra = {}) => ({
  id: '0000000a',
  carrier,
  number,
  date: '2025-05-18',
  origin: null,
  destination: null,
  ...extra,
});
const snap = (followed, list = FLIGHTS) => summarizeFlight(pickFlight(list, followed), followed);
const cases = () => {
  const kl835 = make('KL', 835);
  const ss774 = make('SS', 774, { destination: 'RUN' });
  const kl807 = make('KL', 807);
  const af27 = make('AF', 27);
  const late = beforeTakeOff('20250518+KL+0835');
  late.flightLegs[0].departureInformation.times.latestPublished = '2025-05-18T22:05:00.000+02:00';
  return [
    [kl835, snap(kl835)],
    [ss774, snap(ss774)],
    [kl807, snap(kl807)],
    [af27, snap(af27)],
    [kl835, snap(kl835, [late])],
    [make('AF', 1234), notFound(make('AF', 1234))],
  ];
};

test('the flight widget fits the budget of a card, in every case and language', () => {
  for (const language of LANGUAGES) {
    for (const [followed, snapshot] of cases()) {
      const content = buildFlightWidget({
        followed,
        snapshot,
        readAt: NOW,
        language,
        timeZone: TIME_ZONE,
      });
      assert.deepEqual(
        validateWidgetContent(content),
        [],
        `${followed.carrier}${followed.number} ${language}`,
      );
    }
  }
});

test('the flight widget: times, gate before take-off, belt once landed, reason', () => {
  const [[kl835, landed], , [kl807, cancelled], [af27, belt], [, late]] = cases();
  const values = (content) =>
    content.components.filter((c) => c.type === 'value').map((c) => c.value);
  assert.deepEqual(
    values(buildFlightWidget({ followed: kl835, snapshot: late, readAt: NOW, language: 'fr' })),
    ['22:05', '19:25', 'E07'],
  );
  assert.deepEqual(
    values(buildFlightWidget({ followed: af27, snapshot: belt, readAt: NOW, language: 'fr' })),
    ['07:35', '16:59', '33'],
  );
  const content = buildFlightWidget({
    followed: kl835,
    snapshot: landed,
    readAt: NOW,
    language: 'fr',
  });
  assert.equal(content.components[0].text, 'KL835 · Amsterdam → Denpasar Bali');
  assert.equal(
    content.components.at(-1).text,
    'This flight was delayed due to operational issues.',
  );
  const rows = (snapshot) =>
    Object.fromEntries(
      buildFlightWidget({ followed: kl835, snapshot, readAt: NOW, language: 'fr' })
        .components.find((c) => c.type === 'status')
        .items.map((item) => [item.label, item.value]),
    );
  assert.deepEqual(rows(late), {
    Statut: 'Retardé',
    Retard: '+75 min',
    Prévu: '20:50 → 19:25 (+1)',
    Terminal: 'AMS T2',
    Avion: 'BOEING 777-300ER',
  });
  const off = buildFlightWidget({
    followed: kl807,
    snapshot: cancelled,
    readAt: NOW,
    language: 'fr',
  });
  const status = off.components.find((c) => c.type === 'status');
  assert.deepEqual(status.items[0], {
    label: 'Statut',
    value: 'Annulé',
    icon: 'x-circle',
    color: 'danger',
  });
  assert.ok(!status.items.some((item) => item.label === 'Retard'));
  assert.equal(delayColor(5), 'success');
  assert.equal(delayColor(30), 'warning');
  assert.equal(delayColor(90), 'danger');
});

test('the flights widget lists every flight with its badge and the calls of the day', () => {
  const rows = cases().map(([followed, snapshot]) => ({ followed, snapshot }));
  rows.push({ followed: make('AF', 9), snapshot: null });
  for (const language of LANGUAGES) {
    const content = buildFlightsWidget({ rows, used: 23, limit: 100, language });
    assert.deepEqual(validateWidgetContent(content), [], language);
  }
  const fr = buildFlightsWidget({ rows, used: 23, limit: 100, language: 'fr' });
  const [list, caption] = fr.components;
  assert.equal(list.items.length, 7);
  assert.deepEqual(list.items[4], {
    title: 'KL835 · AMS → DPS',
    subtitle: 'dim. 18 mai · 22:05 → 19:25 (+1)',
    badge: { text: '+75 min', color: 'warning' },
  });
  assert.equal(list.items[6].badge.text, 'pas encore lu');
  assert.equal(caption.text, '23/100 requêtes aujourd’hui · Air France-KLM');
  const empty = buildFlightsWidget({ rows: [], used: 0, limit: 100, language: 'en' });
  assert.match(empty.components[0].text, /No flight followed/);
});

test('the device: every feature complete, delays as signed minutes, states in bounds', () => {
  const [[kl835, landed], , [kl807, cancelled]] = cases();
  const device = buildFlightDevice(fakeGladys, kl835, landed, 'fr');
  assert.equal(device.name, 'Vol KL835 AMS → DPS · 18/05');
  assert.equal(device.external_id, 'ext:air-france-klm:flight:0000000a');
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback', 'category', 'type']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
  }
  const delays = device.features.filter((f) => f.category === DEVICE_FEATURE_CATEGORIES.DURATION);
  assert.equal(delays.length, 2);
  assert.ok(delays.every((f) => f.min === DELAY_RANGE.min && f.unit === 'minutes'));
  assert.equal(buildFlightDevice(fakeGladys, kl835, null, 'en').name, 'Flight KL835 · 18/05');
  assert.equal(flightIdOf(device.external_id), '0000000a');
  assert.equal(flightIdOf(`${device.external_id}:status`), '0000000a');
  assert.equal(flightIdOf('ext:other:route:0000000a'), null);
  const states = Object.fromEntries(
    buildFlightStates(fakeGladys, kl835, landed, 'fr').map((s) => [
      s.device_feature_external_id.split(':').pop(),
      s.text ?? s.state,
    ]),
  );
  assert.deepEqual(states, {
    status: 'Arrivé',
    departure: '21:07 (prévu 20:50) · AMS T2 · porte E07',
    arrival: '19:30 (+1) (prévu 19:25) · DPS',
    departure_delay: 17,
    arrival_delay: 5,
  });
  const off = buildFlightStates(fakeGladys, kl807, cancelled, 'fr');
  assert.ok(
    off.every((s) => s.state === undefined),
    'a cancelled flight has no delay',
  );
});
