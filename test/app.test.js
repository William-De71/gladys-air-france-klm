// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake Flight Status API serving a real (reduced) answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, QUOTA_PAUSE_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS, FLIGHT_OUTPUTS } from '../src/events.js';
import {
  fakeAfkl,
  storePath,
  silent,
  beforeTakeOff,
  flight,
  NOW,
  TIME_ZONE,
  KEY,
} from './helpers/fixtures.js';

const PREFIX = 'ext:test-integration';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * @description Identifiers for the flights, in order.
 * @returns {Function} `() => string`.
 */
function ids() {
  let next = 10;
  return () => (next++).toString(16).padStart(8, '0');
}

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, path, flights }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({
  config = { api_key: KEY, language: 'fr' },
  path = storePath(),
  flights = [beforeTakeOff('20250518+KL+0835'), flight('20250518+KL+0807')],
} = {}) {
  const clock = { now: NOW };
  const api = fakeAfkl({ flights });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    sleep: async () => {},
    timeZone: TIME_ZONE,
    timers: false,
    newId: ids(),
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const deviceOf = (id) => `${PREFIX}:flight:${id}`;
const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const follow = (gladys, fields) =>
  gladys.fake.action(ACTIONS.ADD_FLIGHT, { flight: 'KL835', date: "aujourd'hui", ...fields });
const setDeparture = (api, id, time) => {
  const raw = api.state.flights.find((entry) => entry.id === id);
  raw.flightLegs[0].departureInformation.times.latestPublished = time;
};

test('without a key: says so, calls nothing', async () => {
  const { gladys, api } = await startApp({ config: { language: 'fr' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Saisissez la clé d’API/);
  const ack = await follow(gladys, {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Pas de clé d’API/);
  assert.equal(api.calls.length, 0);
});

test('with a key and no flight: ready, no call', async () => {
  const { gladys, api } = await startApp();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /Suivre un vol/);
  assert.equal(api.calls.length, 0);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('"Follow a flight" reads it once, offers its device, publishes its states once created', async () => {
  const { gladys, api } = await startApp();
  const ack = await follow(gladys, {});
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.fr, /^KL835 du 18\/05 suivi : à l’heure\. Ajoutez son appareil/);
  assert.match(ack.data.message.en, /^KL835 of 18\/05 followed: on time\./);
  assert.equal(api.calls.length, 1);
  const [call] = api.calls;
  assert.equal(call.path, '/opendata/flightstatus');
  assert.deepEqual(call.params, {
    startRange: '2025-05-17T12:00:00Z',
    endRange: '2025-05-19T23:59:59Z',
    carrierCode: 'KL',
    flightNumber: '835',
    pageSize: '20',
  });
  assert.equal(call.headers['API-Key'], KEY);
  assert.equal(call.headers['accept-language'], 'fr-FR');
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, deviceOf('0000000a'));
  assert.equal(device.name, 'Vol KL835 AMS → DPS · 18/05');
  await created(gladys, device.external_id);
  assert.equal(gladys.fake.lastState(`${device.external_id}:status`), 'À l’heure');
  assert.equal(
    gladys.fake.lastState(`${device.external_id}:departure`),
    '20:50 · AMS T2 · porte E07',
  );
  assert.equal(gladys.fake.lastState(`${device.external_id}:departure_delay`), 0);
  assert.deepEqual(gladys.fake.config.flights, [
    {
      id: '0000000a',
      carrier: 'KL',
      number: 835,
      date: '2025-05-18',
      origin: null,
      destination: null,
    },
  ]);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is a baseline');
  assert.equal(api.calls.length, 1);
});

test('the form refuses what is not a flight, and a refused key adds nothing', async () => {
  const { gladys, api } = await startApp();
  assert.match(
    (await follow(gladys, { flight: 'Air France' })).error,
    /n’est pas un numéro de vol/,
  );
  assert.match((await follow(gladys, { date: '31/02' })).error, /n’est pas une date/);
  assert.match((await follow(gladys, { origin: 'Paris' })).error, /codes de 3 lettres/);
  api.state.fail = 403;
  api.state.failBody = '<h1>Developer Inactive</h1>';
  const refused = await follow(gladys, {});
  assert.match(refused.error, /Clé refusée \(HTTP 403: Developer Inactive\)/);
  assert.equal(gladys.fake.config.flights, undefined);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  api.state.fail = null;
  assert.equal((await follow(gladys, {})).success, true);
  assert.equal((await follow(gladys, {})).error, 'Ce vol est déjà suivi.');
});

test('a flight not published yet is followed anyway, and read every 12 hours', async () => {
  const { gladys, api, app, clock } = await startApp();
  const ack = await follow(gladys, { flight: 'AF1234', date: '+5' });
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.fr, /ne l’a pas encore publié/);
  assert.equal(gladys.fake.discoveredDevices[0].name, 'Vol AF1234 · 23/05');
  clock.now += 11 * HOUR;
  await app.tick();
  assert.equal(api.calls.length, 1);
  clock.now += 2 * HOUR;
  await app.tick();
  assert.equal(api.calls.length, 2);
});

test('delay, gate and landing fire their scene events once, then the flight is no longer read', async () => {
  const { gladys, app, api, clock } = await startApp();
  await follow(gladys, {});
  await created(gladys, deviceOf('0000000a'));
  // 2 h 50 before the departure: read again every 30 minutes.
  clock.now += 20 * MINUTE;
  await app.tick();
  assert.equal(api.calls.length, 1, 'not due yet');
  clock.now += 15 * MINUTE;
  setDeparture(api, '20250518+KL+0835', '2025-05-18T21:30:00.000+02:00');
  await app.tick();
  assert.equal(api.calls.length, 2);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.STATUS_CHANGED, TRIGGERS.DELAY_CHANGED],
  );
  const [status, delay] = gladys.fake.sceneEvents;
  assert.equal(status.data.flight, deviceOf('0000000a'));
  assert.equal(status.data.status, 'delayed');
  assert.equal(status.data.previous_status, 'on_time');
  assert.equal(delay.data.delay, 40);
  assert.equal(gladys.fake.lastState(`${deviceOf('0000000a')}:departure_delay`), 40);
  assert.equal(gladys.fake.lastState(`${deviceOf('0000000a')}:status`), 'Retardé');
  // A new gate.
  const raw = api.state.flights.find((entry) => entry.id === '20250518+KL+0835');
  raw.flightLegs[0].departureInformation.airport.places.gateNumber = ['E09'];
  clock.now += 31 * MINUTE;
  await app.tick();
  assert.equal(eventsOf(gladys, TRIGGERS.GATE_CHANGED).length, 1);
  assert.equal(eventsOf(gladys, TRIGGERS.GATE_CHANGED)[0].data.previous_gate, 'E07');
  // The night after: landed at Denpasar.
  api.state.flights = [flight('20250518+KL+0835')];
  clock.now += 20 * HOUR;
  await app.tick();
  const landed = eventsOf(gladys, TRIGGERS.STATUS_CHANGED).at(-1);
  assert.equal(landed.data.status, 'arrived');
  assert.equal(gladys.fake.lastState(`${deviceOf('0000000a')}:arrival_delay`), 5);
  const calls = api.calls.length;
  clock.now += 5 * HOUR;
  await app.tick();
  assert.equal(api.calls.length, calls, 'a landed flight is not read any more');
});

test('a restart keeps the readings, the events seen and the calls of the day', async () => {
  const path = storePath();
  const first = await startApp({ path });
  await follow(first.gladys, {});
  assert.equal(first.api.calls.length, 1);
  const { api, app, gladys } = await startApp({ path, config: first.gladys.fake.config });
  assert.equal(api.calls.length, 0, 'not due yet: not read again');
  assert.equal(app.budget.used(), 1);
  assert.equal(app.readingOf(app.registry.list()[0]).snapshot.status, 'on_time');
  assert.match(gladys.fake.connectionStatus.message.fr, /1 vol\(s\) suivi\(s\) · 1\/100 requêtes/);
});

test('the daily limit stops the automatic readings first, then everything', async () => {
  const { gladys, app, api, clock } = await startApp({
    config: { api_key: KEY, language: 'fr', daily_limit: 10 },
  });
  await follow(gladys, {});
  app.store.data.budget.used = 5;
  clock.now += HOUR;
  await app.tick();
  assert.equal(api.calls.length, 1, 'the reserve is kept for the actions');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /Limite quotidienne atteinte \(10 requêtes\)/,
  );
  const action = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_FLIGHT, {
    flight: deviceOf('0000000a'),
  });
  assert.equal(action.success, true, action.error);
  assert.equal(api.calls.length, 2, 'a scene action may use the reserve');
  app.store.data.budget.used = 10;
  const lookUp = await gladys.fake.sceneAction(SCENE_ACTIONS.LOOK_UP_FLIGHT, {
    flight_number: 'KL807',
  });
  assert.match(lookUp.error, /Limite quotidienne atteinte/);
  // The next UTC day.
  clock.now += 24 * HOUR;
  await app.tick();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a 429 pauses the automatic readings for an hour, a network error is retried', async () => {
  const { gladys, app, api, clock } = await startApp();
  await follow(gladys, {});
  api.state.fail = 429;
  clock.now += HOUR;
  await app.tick();
  assert.match(gladys.fake.connectionStatus.message.en, /refuses more calls for now/);
  api.state.fail = null;
  const calls = api.calls.length;
  clock.now += QUOTA_PAUSE_MS - MINUTE;
  await app.tick();
  assert.equal(api.calls.length, calls, 'paused');
  clock.now += 2 * MINUTE;
  await app.tick();
  assert.equal(api.calls.length, calls + 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  api.state.fail = 'network';
  clock.now += HOUR;
  await app.tick();
  const widget = await gladys.fake.widgetGet(WIDGETS.FLIGHT, {
    settings: { flight: deviceOf('0000000a') },
    language: 'fr',
  });
  assert.equal(widget.success, true, widget.error);
  assert.match(JSON.stringify(widget.data.content), /KL835/, 'the last reading is still shown');
});

test('the scene actions: read a followed flight, look up any flight, never an event', async () => {
  const { gladys, api, clock } = await startApp();
  await follow(gladys, {});
  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_FLIGHT, {
    flight: deviceOf('0000000a'),
  });
  assert.equal(read.success, true, read.error);
  assert.deepEqual(Object.keys(read.data.outputs).sort(), [...FLIGHT_OUTPUTS].sort());
  assert.equal(read.data.outputs.status, 'on_time');
  assert.equal(read.data.outputs.gate, 'E07');
  assert.equal(api.calls.length, 1, 'a fresh reading is reused');
  clock.now += 11 * MINUTE;
  await gladys.fake.sceneAction(SCENE_ACTIONS.GET_FLIGHT, { flight: deviceOf('0000000a') });
  assert.equal(api.calls.length, 2, 'older than 10 minutes: read again');
  const lookUp = await gladys.fake.sceneAction(SCENE_ACTIONS.LOOK_UP_FLIGHT, {
    flight_number: 'kl 807',
    date: '18/05/2025',
  });
  assert.equal(lookUp.success, true, lookUp.error);
  assert.equal(lookUp.data.outputs.status, 'cancelled');
  assert.match(lookUp.data.outputs.summary, /^Vol KL807 Amsterdam → Manila : annulé\./);
  await gladys.fake.sceneAction(SCENE_ACTIONS.LOOK_UP_FLIGHT, { flight_number: 'KL807' });
  assert.equal(api.calls.length, 3, 'kept 15 minutes');
  const unknown = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_FLIGHT, {
    flight: deviceOf('ffffffff'),
  });
  assert.match(unknown.error, /n’est plus un vol suivi/);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('the widgets fit the vocabulary, in every language', async () => {
  const { gladys } = await startApp();
  await follow(gladys, {});
  await follow(gladys, { flight: 'KL807' });
  for (const language of ['fr', 'en', 'de', 'es']) {
    const one = await gladys.fake.widgetGet(WIDGETS.FLIGHT, {
      settings: { flight: deviceOf('0000000a') },
      language,
    });
    assert.equal(one.success, true, one.error);
    assert.deepEqual(validateWidgetContent(one.data.content), [], language);
    const list = await gladys.fake.widgetGet(WIDGETS.FLIGHTS, { settings: {}, language });
    assert.deepEqual(validateWidgetContent(list.data.content), [], language);
    assert.equal(list.data.content.components[0].items.length, 2);
  }
  assert.equal(gladys.fake.config.last_language, 'es');
  const none = await gladys.fake.widgetGet(WIDGETS.FLIGHT, { settings: {}, language: 'fr' });
  assert.match(none.data.content.components[0].text, /Choisissez un vol/);
});

test('list, stop following, and the old flights dropped three days after', async () => {
  const { gladys, app, clock } = await startApp();
  await follow(gladys, {});
  await follow(gladys, { flight: 'AF1234', date: '+2' });
  const list = await gladys.fake.action(ACTIONS.LIST_FLIGHTS, {});
  assert.match(list.data.message, /2 vol\(s\) suivi\(s\), 2 requêtes sur 100/);
  assert.match(list.data.message, /1\. KL835 · 18\/05 · AMS → DPS · À l’heure/);
  assert.match(list.data.message, /2\. AF1234 · 20\/05 · Non publié/);
  const removed = await gladys.fake.action(ACTIONS.REMOVE_FLIGHT, { flight: 'af1234' });
  assert.match(removed.data.message.fr, /AF1234 du 20\/05 n’est plus suivi/);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  clock.now += 4 * 24 * HOUR;
  await app.tick();
  assert.equal(app.registry.list().length, 0);
  assert.deepEqual(gladys.fake.config.flights, []);
  assert.equal(app.store.data.readings['0000000a'], undefined);
});

test('"Test the connection" reads one flight and tells the calls of the day', async () => {
  const { gladys, api } = await startApp();
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION, {});
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.fr, /la clé est acceptée\. 1 requêtes sur 100/);
  assert.equal(api.calls[0].params.carrierCode, 'AF');
  api.state.fail = 'network';
  const down = await gladys.fake.action(ACTIONS.TEST_CONNECTION, {});
  assert.match(down.error, /injoignable : ECONNREFUSED/);
});

test('the manifest declares what the handlers answer', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key),
    Object.values(SCENE_ACTIONS),
  );
});
