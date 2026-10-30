// -----------------------------------------------------------------------------
// HTTP client of the Flight Status API of Air France-KLM (Open Data,
// https://developer.airfranceklm.com), with the key of the user's own
// application on the developer portal (header `API-Key`).
//
//   GET https://api.airfranceklm.com/opendata/flightstatus
//       ?startRange=2026-11-05T12:00:00Z&endRange=2026-11-07T23:59:59Z
//       &carrierCode=AF&flightNumber=1234
//
// answers `{ operationalFlights: [...], page }` (application/hal+json): one
// operational flight per flight number and schedule date, its legs, their
// scheduled, latest published and actual times (local time of the airport,
// with its offset), terminal, gate, baggage belt, delays and their public
// reasons (in the language of `Accept-Language`).
//
// The free plan of the portal allows 100 calls a day and 1 call a second
// (the app.js budget keeps the daily count; this client spaces the calls).
// A key not activated or not subscribed to Flight Status gets a 403 "Developer
// Inactive"; 429 beyond the quota. A search without any flight answers 404 or
// an empty list: both mean "no such flight (yet)".
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { addDays } from './time.js';

const BASE_URL = process.env.AFKL_API_URL || 'https://api.airfranceklm.com/opendata';
const TIMEOUT_MS = 20000;
// One call a second at most: a little more, for the clock of the portal.
const MIN_GAP_MS = 1100;
const PAGE_SIZE = 20;
const LANGUAGE_HEADERS = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-air-france-klm/${version} (+https://github.com/William-De71/gladys-air-france-klm)`;

class AfklError extends Error {
  /**
   * @param {string} kind - `auth`, `quota`, `budget`, `unreachable` or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'AfklError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description A short text of an error body (HTML or JSON).
 * @param {string} body - The body.
 * @returns {string} At most 120 characters, without tags.
 */
function bodyDetail(body) {
  let text = String(body ?? '');
  try {
    const json = JSON.parse(text);
    const first = Array.isArray(json?.errors) ? json.errors[0] : json;
    text = first?.description ?? first?.message ?? first?.name ?? text;
  } catch {
    // Not JSON: an HTML page of the gateway ("<h1>Developer Inactive</h1>").
  }
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * @description The time range of a search: the schedule date of a flight is
 * the local date of its first departure, anywhere in the world, so the range
 * goes from noon UTC the day before to the end of the day after.
 * @param {string} date - `YYYY-MM-DD`.
 * @returns {{ startRange: string, endRange: string }} The range, in UTC.
 */
function rangeOf(date) {
  return {
    startRange: `${addDays(date, -1)}T12:00:00Z`,
    endRange: `${addDays(date, 1)}T23:59:59Z`,
  };
}

/**
 * @description A client of the Flight Status API.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {string} [options.baseUrl] - The root of the API (tests, end-to-end runs).
 * @param {Function} [options.onRequest] - Called before each call (the daily budget).
 * @returns {object} `{ flights, setKey, requests }`.
 */
function createAfklClient({
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  baseUrl = BASE_URL,
  onRequest = () => {},
} = {}) {
  let apiKey = '';
  // Requests made, for the diagnostic.
  const requests = { total: 0, failed: 0, last: null };
  // The calls run one after the other, MIN_GAP_MS apart.
  let queue = Promise.resolve();
  let lastCall = 0;

  /**
   * @description Call the API.
   * @param {string} path - `/flightstatus`.
   * @param {object} params - Query parameters.
   * @param {string} language - The language of the public texts.
   * @returns {Promise<object|null>} The JSON answer, null for a 404.
   */
  async function call(path, params, language) {
    if (!apiKey) {
      throw new AfklError('auth', 'no API key');
    }
    const wait = lastCall + MIN_GAP_MS - now();
    if (wait > 0) {
      await sleep(wait);
    }
    onRequest();
    lastCall = now();
    requests.total += 1;
    requests.last = lastCall;
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
    );
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}?${query}`, {
        headers: {
          'API-Key': apiKey,
          accept: '*/*',
          'accept-language': LANGUAGE_HEADERS[language] ?? LANGUAGE_HEADERS.en,
          'user-agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      throw new AfklError('unreachable', err.cause?.code ?? err.message);
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      requests.failed += 1;
      let detail = `HTTP ${response.status}`;
      try {
        const text = bodyDetail(await response.text());
        if (text) {
          detail = `${detail}: ${text}`;
        }
      } catch {
        // No body: the status says enough.
      }
      let kind = 'unreachable';
      if (response.status === 401 || response.status === 403) {
        kind = 'auth';
      } else if (response.status === 429) {
        kind = 'quota';
      } else if (response.status >= 400 && response.status < 500) {
        kind = 'invalid';
      }
      throw new AfklError(kind, detail, { status: response.status });
    }
    try {
      return await response.json();
    } catch (err) {
      requests.failed += 1;
      throw new AfklError('invalid', `flightstatus: ${err.message}`);
    }
  }

  return {
    requests,
    /** @param {string} key - The API key. */
    setKey(key) {
      apiKey = String(key ?? '').trim();
    },
    hasKey: () => Boolean(apiKey),
    /**
     * @description The operational flights of a flight number around a date.
     * @param {object} search - `{ carrier, number, date, language }`.
     * @returns {Promise<object[]>} The operational flights (maybe empty).
     */
    flights({ carrier, number, date, language }) {
      const run = queue.then(async () => {
        const body = await call(
          '/flightstatus',
          {
            ...rangeOf(date),
            carrierCode: carrier,
            flightNumber: String(number),
            pageSize: PAGE_SIZE,
          },
          language,
        );
        if (body === null) {
          return [];
        }
        if (!body || typeof body !== 'object') {
          throw new AfklError('invalid', 'flightstatus: not an object');
        }
        const list = body.operationalFlights ?? [];
        if (!Array.isArray(list)) {
          throw new AfklError('invalid', 'flightstatus: operationalFlights is not a list');
        }
        return list;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

export {
  BASE_URL,
  MIN_GAP_MS,
  PAGE_SIZE,
  USER_AGENT,
  LANGUAGE_HEADERS,
  AfklError,
  bodyDetail,
  rangeOf,
  createAfklClient,
};
