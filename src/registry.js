// -----------------------------------------------------------------------------
// The registry of the followed flights, declared with the configuration
// buttons ("Follow a flight", "Stop following a flight"): plain forms whose
// fields are checked here, no JSON to type.
//
// A followed flight is a flight number (AF 1234), its date (the departure
// date on the boarding pass) and, for a flight with stops, the airports the
// passenger boards and leaves at. Stored through setConfig() under
// INTERNAL_KEYS.flights, a key outside the config_schema: the flights live in
// the Gladys database and follow its backups. Changes run one after the
// other, and are applied in memory once Gladys saved them.
//
// Each flight gets a random identifier at creation (8 hex digits), kept for
// ever: it builds the external ids of its device. A flight is dropped from
// the list FORGET_DAYS after its date; its device stays until the user
// deletes it.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { INTERNAL_KEYS } from './config.js';
import { parseFlightNumber, parseAirport, flightLabel } from './flights.js';
import { parseDateInput, isDate, addDays } from './time.js';

const MAX_FLIGHTS = 10;
const FORGET_DAYS = 3;
// A flight is followed up to a year ahead (airlines sell 330 days ahead).
const MAX_DAYS_AHEAD = 366;
const ID_PATTERN = /^[0-9a-f]{8}$/;

class RegistryError extends Error {
  /**
   * @param {string} key - The TEXTS key of the message.
   * @param {object} [params] - Its substitutions.
   */
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

/**
 * @description Read the fields of the "Follow a flight" form.
 * @param {object} fields - `{ flight, date, origin, destination }`.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @returns {object} `{ carrier, number, date, origin, destination }`.
 */
function readFlightFields(fields, today) {
  const number = parseFlightNumber(fields?.flight);
  if (!number) {
    throw new RegistryError('errorFlightNumber', {
      value: String(fields?.flight ?? '').slice(0, 20),
    });
  }
  const date = parseDateInput(fields?.date, today);
  if (!date) {
    throw new RegistryError('errorDate', { value: String(fields?.date ?? '').slice(0, 20) });
  }
  if (date < addDays(today, -1) || date > addDays(today, MAX_DAYS_AHEAD)) {
    throw new RegistryError('errorDateRange');
  }
  const origin = parseAirport(fields?.origin);
  const destination = parseAirport(fields?.destination);
  if (origin === undefined || destination === undefined) {
    throw new RegistryError('errorAirport');
  }
  if (origin && origin === destination) {
    throw new RegistryError('errorAirport');
  }
  return { ...number, date, origin, destination };
}

/**
 * @description Check a stored or built flight.
 * @param {object} raw - The flight.
 * @returns {object} The clean flight.
 */
function validateFlight(raw) {
  const flight = raw ?? {};
  if (!ID_PATTERN.test(flight.id ?? '')) {
    throw new RegistryError('errorStored');
  }
  const number = parseFlightNumber(`${flight.carrier ?? ''}${flight.number ?? ''}`);
  if (!number || number.carrier !== flight.carrier || number.number !== flight.number) {
    throw new RegistryError('errorStored');
  }
  if (!isDate(flight.date)) {
    throw new RegistryError('errorStored');
  }
  const origin = parseAirport(flight.origin);
  const destination = parseAirport(flight.destination);
  if (origin === undefined || destination === undefined) {
    throw new RegistryError('errorStored');
  }
  return { id: flight.id, ...number, date: flight.date, origin, destination };
}

/**
 * @description Read the stored flights.
 * @param {unknown} raw - The stored value: an array (or its JSON text).
 * @param {object} [logger] - Logger.
 * @returns {object[]} The valid flights, without duplicates, MAX_FLIGHTS at most.
 */
function parseFlights(raw, logger) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      logger?.warn('Air France-KLM: the stored flights are not JSON, ignored');
      return [];
    }
  }
  const flights = [];
  const seen = new Set();
  for (const entry of Array.isArray(list) ? list : []) {
    try {
      const flight = validateFlight(entry);
      if (!seen.has(flight.id)) {
        seen.add(flight.id);
        flights.push(flight);
      }
    } catch {
      logger?.warn(
        `Air France-KLM: stored flight ignored: ${JSON.stringify(entry)?.slice(0, 200)}`,
      );
    }
  }
  return flights.slice(0, MAX_FLIGHTS);
}

/**
 * @description Whether two followed flights are the same trip.
 * @param {object} a - A flight.
 * @param {object} b - Another one.
 * @returns {boolean} True when number, date and airports are equal.
 */
const sameFlight = (a, b) =>
  a.carrier === b.carrier &&
  a.number === b.number &&
  a.date === b.date &&
  (a.origin ?? null) === (b.origin ?? null) &&
  (a.destination ?? null) === (b.destination ?? null);

/**
 * @description Sort the flights by date, then by number.
 * @param {object[]} flights - The flights.
 * @returns {object[]} A sorted copy.
 */
const sortFlights = (flights) =>
  [...flights].sort(
    (a, b) => a.date.localeCompare(b.date) || flightLabel(a).localeCompare(flightLabel(b)),
  );

/**
 * @description The registry of the followed flights.
 * @param {object} gladys - SDK client (setConfig).
 * @param {object} [options] - Options.
 * @param {object} [options.logger] - Logger.
 * @param {Function} [options.newId] - `() => string`, 8 hex digits (tests).
 * @returns {object} The registry.
 */
function createRegistry(gladys, { logger, newId = () => randomBytes(4).toString('hex') } = {}) {
  let flights = [];
  let writing = Promise.resolve();

  // One change at a time, computed from the previous one once it is saved.
  const serial = (change) => {
    const run = writing.then(async () => {
      const { next, result } = change(flights);
      if (next !== flights) {
        await gladys.setConfig({ [INTERNAL_KEYS.flights]: next });
        flights = next;
      }
      return result;
    });
    writing = run.catch(() => {});
    return run;
  };

  return {
    /** @param {object} config - The raw config. @returns {object[]} The flights. */
    load(config) {
      flights = sortFlights(parseFlights(config?.[INTERNAL_KEYS.flights], logger));
      return flights;
    },

    list: () => flights,

    /** @param {string} id - Identifier. @returns {object|undefined} The flight. */
    byId: (id) => flights.find((flight) => flight.id === id),

    /**
     * @description Find a flight by its number in the list (#2 or 2), its
     * identifier, or its flight number ("AF1234", the first one when it is
     * followed on several dates).
     * @param {unknown} query - What the user typed.
     * @returns {object} The flight.
     */
    find(query) {
      const text = String(query ?? '').trim();
      if (!text) {
        throw new RegistryError('errorFlightMissing');
      }
      const index = /^#?(\d{1,2})$/.exec(text);
      if (index) {
        const flight = flights[Number(index[1]) - 1];
        if (!flight) {
          throw new RegistryError('errorFlightUnknown', { query: text.slice(0, 40) });
        }
        return flight;
      }
      const byId = flights.find((flight) => flight.id === text.toLowerCase());
      if (byId) {
        return byId;
      }
      const number = parseFlightNumber(text);
      const match =
        number &&
        flights.find(
          (flight) => flight.carrier === number.carrier && flight.number === number.number,
        );
      if (!match) {
        throw new RegistryError('errorFlightUnknown', { query: text.slice(0, 40) });
      }
      return match;
    },

    /**
     * @description Follow a flight.
     * @param {object} fields - `{ carrier, number, date, origin, destination }`.
     * @returns {Promise<object>} The flight added.
     */
    add(fields) {
      return serial((current) => {
        if (current.length >= MAX_FLIGHTS) {
          throw new RegistryError('errorTooManyFlights', { max: MAX_FLIGHTS });
        }
        let id = newId();
        while (current.some((flight) => flight.id === id)) {
          id = newId();
        }
        const flight = validateFlight({ ...fields, id });
        if (current.some((other) => sameFlight(other, flight))) {
          throw new RegistryError('errorFlightExists');
        }
        return { next: sortFlights([...current, flight]), result: flight };
      });
    },

    /**
     * @description Stop following a flight.
     * @param {string} id - The flight.
     * @returns {Promise<object>} The flight removed.
     */
    remove(id) {
      return serial((current) => {
        const flight = current.find((entry) => entry.id === id);
        if (!flight) {
          throw new RegistryError('errorFlightUnknown', { query: id });
        }
        return { next: current.filter((entry) => entry.id !== id), result: flight };
      });
    },

    /**
     * @description Drop the flights whose date is FORGET_DAYS behind.
     * @param {string} today - Today, `YYYY-MM-DD`.
     * @returns {Promise<object[]>} The flights dropped.
     */
    prune(today) {
      return serial((current) => {
        const limit = addDays(today, -FORGET_DAYS);
        const old = current.filter((flight) => flight.date < limit);
        if (!old.length) {
          return { next: current, result: [] };
        }
        return { next: current.filter((flight) => flight.date >= limit), result: old };
      });
    },
  };
}

export {
  MAX_FLIGHTS,
  FORGET_DAYS,
  MAX_DAYS_AHEAD,
  RegistryError,
  readFlightFields,
  validateFlight,
  parseFlights,
  sameFlight,
  sortFlights,
  createRegistry,
};
