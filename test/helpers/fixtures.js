// A fake Flight Status API of Air France-KLM for the tests, served through
// the `fetch` option of the integration. Its flights come from a real answer
// of the API for 18 May 2025 (test/fixtures/flightstatus.json, reduced to six
// flights): AF 27 and AF 28 (Paris ⇄ Papeete via Los Angeles, landed), KL 701
// and KL 835 (landed, delayed at Amsterdam, with public reasons), KL 807
// (cancelled) and SS 774 of Corsair (in flight to La Réunion). `beforeTakeOff`
// derives the KL 835 of the afternoon, before its departure, by removing what
// happened after 16:00 UTC. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Sunday 18 May 2025, 18:00 in Paris: KL 835 leaves Amsterdam at 20:50.
const NOW = Date.parse('2025-05-18T16:00:00Z');
const TIME_ZONE = 'Europe/Paris';
const KEY = 'test-key-0123456789';

const FLIGHTS = JSON.parse(
  readFileSync(new URL('../fixtures/flightstatus.json', import.meta.url), 'utf8'),
).operationalFlights;

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'air-france-klm-')), 'air-france-klm.json');

/**
 * @description A flight of the fixture.
 * @param {string} id - "20250518+KL+0835".
 * @returns {object} A copy of the operational flight.
 */
const flight = (id) => clone(FLIGHTS.find((entry) => entry.id === id));

/**
 * @description A flight as the API showed it before its take-off: no actual
 * time, no difference, the scheduled times as the latest published ones, and
 * the status of a flight on time.
 * @param {string} id - The flight.
 * @returns {object} The flight.
 */
function beforeTakeOff(id) {
  const copy = flight(id);
  copy.flightStatusPublic = 'ON_TIME';
  copy.flightStatusPublicLangTransl = 'On time';
  for (const leg of copy.flightLegs) {
    for (const side of ['departureInformation', 'arrivalInformation']) {
      const times = leg[side].times;
      for (const key of Object.keys(times)) {
        if (key !== 'scheduled') {
          delete times[key];
        }
      }
      times.latestPublished = times.scheduled;
    }
    delete leg.departureDateTimeDifference;
    delete leg.arrivalDateTimeDifference;
    leg.irregularity = { cancelled: 'N' };
    delete leg.otherFlightLegStatuses;
  }
  return copy;
}

/**
 * @description The fake API.
 * @param {object} [options] - `{ flights }`: the operational flights served
 * (the whole fixture by default).
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeAfkl({ flights = FLIGHTS } = {}) {
  const state = {
    flights: clone(flights),
    // 'network', or an HTTP status (with `failBody`), for every request.
    fail: null,
    failBody: '',
  };
  const calls = [];

  /**
   * @description The fetch function.
   * @param {string} url - The URL.
   * @param {object} init - `{ headers }`.
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(url, init = {}) {
    const parsed = new URL(url);
    const params = Object.fromEntries(parsed.searchParams);
    calls.push({ path: parsed.pathname, params, headers: init.headers ?? {} });
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof state.fail === 'number') {
      return new Response(state.failBody, { status: state.fail });
    }
    if (init.headers?.['API-Key'] !== KEY) {
      return new Response('<h1>Developer Inactive</h1>', { status: 403 });
    }
    const list = state.flights.filter(
      (entry) =>
        entry.airline.code === params.carrierCode &&
        entry.flightNumber === Number(params.flightNumber),
    );
    if (!list.length) {
      return new Response('', { status: 404 });
    }
    return new Response(JSON.stringify({ operationalFlights: list, page: { pageNumber: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/hal+json' },
    });
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:air-france-klm:${type}:${id}`,
    feature: (key) => `ext:air-france-klm:${type}:${id}:${key}`,
  }),
};

export {
  NOW,
  TIME_ZONE,
  KEY,
  FLIGHTS,
  silent,
  clone,
  storePath,
  flight,
  beforeTakeOff,
  fakeAfkl,
  fakeGladys,
};
