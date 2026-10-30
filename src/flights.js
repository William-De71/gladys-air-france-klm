// -----------------------------------------------------------------------------
// From the answers of the Flight Status API to what the integration shows.
//
// An operational flight ("20250518+AF+0028", AF 28 of 18 May 2025) has a
// route (CDG → LAX → PPT) and one leg per hop. A followed flight may be the
// whole flight or a part of it (`origin` / `destination`, for a passenger
// who boards at the stop): its segment runs from the leg leaving `origin` to
// the leg reaching `destination`.
//
// Status of a segment (keys stored by users in their scenes, forever):
//   cancelled   the flight or a leg of the segment is cancelled
//   diverted    the flight is diverted
//   arrived     the last leg of the segment has an actual arrival
//   departed    the first leg has an actual departure (in flight)
//   delayed     the departure is 15 minutes late or more
//   on_time     otherwise
//   not_found   the flight is not published yet (a few days before) or the
//               number does not exist on that date
// Partner flights (Delta, Kenya Airways…) come with leg statuses that do not
// follow the times ("ARRIVED" before take-off): the times and the status of
// the flight decide, never the status of a leg.
// -----------------------------------------------------------------------------

import { instantOf, airportClock, durationMinutes, MINUTE_MS } from './time.js';

const STATUSES = [
  'on_time',
  'delayed',
  'departed',
  'arrived',
  'cancelled',
  'diverted',
  'not_found',
];
const FINISHED = new Set(['arrived', 'cancelled']);
// The usual threshold of the airlines and of the EU rules on delays.
const DELAY_MINUTES = 15;
const NUMBER_PATTERN = /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*-?\s*0*(\d{1,4})[A-Z]?$/;
const AIRPORT_PATTERN = /^[A-Z]{3}$/;

/**
 * @description Read a flight number: "AF1234", "af 1234", "KL0809", "A5 3021".
 * @param {unknown} raw - The text.
 * @returns {{ carrier: string, number: number }|null} The airline code and the
 * number, null when not a flight number.
 * @example
 * parseFlightNumber('af 0028'); // -> { carrier: 'AF', number: 28 }
 */
function parseFlightNumber(raw) {
  const match = NUMBER_PATTERN.exec(
    String(raw ?? '')
      .trim()
      .toUpperCase(),
  );
  if (!match) {
    return null;
  }
  const number = Number(match[2]);
  return number > 0 ? { carrier: match[1], number } : null;
}

/**
 * @description Read an airport code (IATA).
 * @param {unknown} raw - "cdg", " NCE ".
 * @returns {string|null|undefined} "CDG", null when empty, undefined when invalid.
 */
function parseAirport(raw) {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!text) {
    return null;
  }
  return AIRPORT_PATTERN.test(text) ? text : undefined;
}

/**
 * @description "AF1234".
 * @param {{ carrier: string, number: number }} flight - A flight number.
 * @returns {string} The flight number as boarding passes write it.
 */
const flightLabel = (flight) => `${flight.carrier}${flight.number}`;

const legsOf = (flight) => (Array.isArray(flight?.flightLegs) ? flight.flightLegs : []);
const departureCode = (leg) => leg?.departureInformation?.airport?.code ?? null;
const arrivalCode = (leg) => leg?.arrivalInformation?.airport?.code ?? null;

/**
 * @description The legs a followed flight covers.
 * @param {object} flight - An operational flight.
 * @param {object} followed - `{ origin, destination }` (null for the whole flight).
 * @returns {object[]|null} The legs, null when the airports are not on the route.
 */
function segmentOf(flight, { origin = null, destination = null } = {}) {
  const legs = legsOf(flight);
  if (!legs.length) {
    return null;
  }
  const start = origin ? legs.findIndex((leg) => departureCode(leg) === origin) : 0;
  if (start < 0) {
    return null;
  }
  let end = legs.length - 1;
  if (destination) {
    end = legs.findIndex((leg, index) => index >= start && arrivalCode(leg) === destination);
    if (end < 0) {
      return null;
    }
  }
  return legs.slice(start, end + 1);
}

/**
 * @description The operational flight a followed flight stands for.
 * @param {object[]} list - The operational flights of the answer.
 * @param {object} followed - `{ carrier, number, date, origin, destination }`.
 * @returns {object|null} The flight, null when none matches.
 */
function pickFlight(list, followed) {
  const candidates = (Array.isArray(list) ? list : []).filter(
    (flight) =>
      flight?.airline?.code === followed.carrier &&
      Number(flight?.flightNumber) === followed.number &&
      segmentOf(flight, followed),
  );
  // The schedule date is the date of the first departure of the flight; a
  // passenger who boards at the stop may give the date of their own leg.
  return (
    candidates.find((flight) => flight.flightScheduleDate === followed.date) ??
    candidates.find(
      (flight) =>
        airportClock(segmentOf(flight, followed)[0]?.departureInformation?.times?.scheduled)
          ?.date === followed.date,
    ) ??
    null
  );
}

/**
 * @description The best known time of a leg end: actual, then estimated,
 * then the latest published, then the scheduled one.
 * @param {object} times - LegTimes.
 * @returns {string|null} The ISO text.
 */
function bestTime(times = {}) {
  return (
    times.actual ??
    times.estimated?.value ??
    times.latestPublished ??
    times.estimatedPublic ??
    times.scheduled ??
    null
  );
}

/**
 * @description The first non-empty value of a list of the API (["", "F42"]).
 * @param {unknown} value - A list or a value.
 * @returns {string} The value, '' when none.
 */
function firstValue(value) {
  const list = Array.isArray(value) ? value : [value];
  const found = list.find((item) => typeof item === 'string' && item.trim());
  return found ? found.trim() : '';
}

/**
 * @description A delay in minutes: the difference the API gives, else the
 * best time minus the scheduled one.
 * @param {unknown} difference - "PT17M".
 * @param {object} times - LegTimes.
 * @returns {number|null} Minutes (negative when early), null when unknown.
 */
function delayOf(difference, times = {}) {
  const given = durationMinutes(difference);
  if (given !== null) {
    return given;
  }
  const scheduled = instantOf(times.scheduled);
  const best = instantOf(bestTime(times));
  if (scheduled === null || best === null) {
    return null;
  }
  return Math.round((best - scheduled) / MINUTE_MS);
}

/**
 * @description The public reason of a delay or a cancellation, in the
 * language of the request.
 * @param {object[]} legs - The legs of the segment.
 * @param {boolean} cancelled - Whether the segment is cancelled.
 * @returns {string} The reason, '' when none.
 */
function reasonOf(legs, cancelled) {
  for (const leg of legs) {
    const irregularity = leg?.irregularity ?? {};
    if (cancelled) {
      const text =
        irregularity.cancellationReasonPublicLong ?? irregularity.cancellationReasonPublicShort;
      if (text) {
        return String(text).trim();
      }
      continue;
    }
    const translated = firstValue(irregularity.delayReasonPublicLangTransl);
    if (translated) {
      return translated;
    }
    const info = (irregularity.delayInformation ?? []).find(
      (item) => item?.delayReasonPublicLong || item?.delayReasonPublicShort,
    );
    if (info) {
      return String(info.delayReasonPublicLong ?? info.delayReasonPublicShort).trim();
    }
  }
  return '';
}

/**
 * @description The name of a city of the API, as people write it.
 * @param {object} airport - DepartureAirport / ArrivalAirport.
 * @returns {string} "Paris", '' when unknown.
 */
function cityOf(airport) {
  const name = airport?.city?.nameLangTranl ?? airport?.city?.name ?? airport?.nameLangTranl ?? '';
  const text = String(name).trim();
  // The API writes some names in capitals ("PARIS"): capitalize each word.
  return text === text.toUpperCase()
    ? text
        .toLowerCase()
        .replace(/(^|[\s'-])(\p{L})/gu, (whole, sep, letter) => sep + letter.toUpperCase())
    : text;
}

/**
 * @description The status of a segment.
 * @param {object} flight - The operational flight.
 * @param {object[]} legs - Its segment.
 * @param {object} departure - The departure summary (delay, actual).
 * @param {object} arrival - The arrival summary (actual).
 * @param {boolean} endsTheFlight - Whether the segment ends where the flight ends.
 * @returns {string} One of STATUSES.
 */
function statusOf(flight, legs, departure, arrival, endsTheFlight) {
  const status = String(flight.flightStatusPublic ?? '').toUpperCase();
  if (
    status.includes('CANCEL') ||
    legs.some((leg) => String(leg?.irregularity?.cancelled).toUpperCase() === 'Y')
  ) {
    return 'cancelled';
  }
  if (status.includes('DIVERT') || legs.some((leg) => firstValue(leg?.irregularity?.divertedTo))) {
    return 'diverted';
  }
  if (arrival.actual || (endsTheFlight && status.includes('ARRIV'))) {
    return 'arrived';
  }
  if (departure.actual) {
    return 'departed';
  }
  if ((departure.delay ?? 0) >= DELAY_MINUTES || status.includes('DELAY')) {
    return 'delayed';
  }
  return 'on_time';
}

/**
 * @description What the integration knows of a followed flight.
 * @param {object} flight - The operational flight (pickFlight).
 * @param {object} followed - `{ carrier, number, date, origin, destination }`.
 * @returns {object} The snapshot (plain data, kept in /data).
 */
function summarizeFlight(flight, followed) {
  const legs = segmentOf(flight, followed);
  const first = legs[0];
  const last = legs[legs.length - 1];
  const depInfo = first.departureInformation ?? {};
  const arrInfo = last.arrivalInformation ?? {};
  const depTimes = depInfo.times ?? {};
  const arrTimes = arrInfo.times ?? {};
  const depPlaces = depInfo.airport?.places ?? {};
  const arrPlaces = arrInfo.airport?.places ?? {};
  const departure = {
    airport: depInfo.airport?.code ?? '',
    city: cityOf(depInfo.airport),
    scheduled: depTimes.scheduled ?? null,
    best: bestTime(depTimes),
    actual: depTimes.actual ?? null,
    delay: delayOf(first.departureDateTimeDifference, depTimes),
    terminal: firstValue([
      depPlaces.boardingTerminal,
      depPlaces.terminalCode,
      depPlaces.departureTerminal,
    ]),
    gate: firstValue(depPlaces.gateNumber),
    checkIn: firstValue(depPlaces.checkInZone),
  };
  const arrival = {
    airport: arrInfo.airport?.code ?? '',
    city: cityOf(arrInfo.airport),
    scheduled: arrTimes.scheduled ?? null,
    best: bestTime(arrTimes),
    actual: arrTimes.actual ?? null,
    delay: delayOf(last.arrivalDateTimeDifference, arrTimes),
    terminal: firstValue([
      arrPlaces.arrivalPositionTerminal,
      arrPlaces.terminalCode,
      arrPlaces.arrivalTerminal,
    ]),
    belt: firstValue(arrPlaces.baggageBelt),
  };
  const legsAll = legsOf(flight);
  const status = statusOf(flight, legs, departure, arrival, last === legsAll[legsAll.length - 1]);
  const aircraft = first.aircraft ?? {};
  return {
    id: String(flight.id ?? ''),
    carrier: followed.carrier,
    number: followed.number,
    airline: String(flight.airline?.name ?? ''),
    scheduleDate: String(flight.flightScheduleDate ?? followed.date),
    status,
    apiStatus: String(flight.flightStatusPublic ?? ''),
    departure,
    arrival,
    stops: legs.length - 1,
    aircraft: {
      type: String(aircraft.typeName ?? aircraft.typeCode ?? ''),
      registration: String(aircraft.registration ?? ''),
    },
    reason: reasonOf(legs, status === 'cancelled'),
  };
}

/**
 * @description The snapshot of a flight the API does not know (yet).
 * @param {object} followed - The followed flight.
 * @returns {object} The snapshot.
 */
function notFound(followed) {
  return {
    id: '',
    carrier: followed.carrier,
    number: followed.number,
    airline: '',
    scheduleDate: followed.date,
    status: 'not_found',
    apiStatus: '',
    departure: { airport: followed.origin ?? '', city: '', delay: null, gate: '', terminal: '' },
    arrival: { airport: followed.destination ?? '', city: '', delay: null, belt: '', terminal: '' },
    stops: 0,
    aircraft: { type: '', registration: '' },
    reason: '',
  };
}

/**
 * @description The delay that matters now: the departure one until take-off,
 * the arrival one after.
 * @param {object} snapshot - A snapshot.
 * @returns {number|null} Minutes.
 */
function currentDelay(snapshot) {
  if (['departed', 'arrived', 'diverted'].includes(snapshot.status)) {
    return snapshot.arrival.delay ?? snapshot.departure.delay ?? null;
  }
  return snapshot.departure.delay ?? null;
}

const isFinished = (snapshot) => FINISHED.has(snapshot?.status);

export {
  STATUSES,
  FINISHED,
  DELAY_MINUTES,
  parseFlightNumber,
  parseAirport,
  flightLabel,
  segmentOf,
  pickFlight,
  bestTime,
  firstValue,
  delayOf,
  reasonOf,
  cityOf,
  statusOf,
  summarizeFlight,
  notFound,
  currentDelay,
  isFinished,
};
