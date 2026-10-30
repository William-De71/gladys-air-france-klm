// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Flight AF1234 CDG → NCE · 06/11": one per followed flight. Read-only
// features:
//   - `status`           text: "Delayed", "In flight", "Landed"…;
//   - `departure`        text: "14:35 (scheduled 14:05) · CDG T2F · gate F42";
//   - `arrival`          text: "16:10 · NCE T2 · belt 5";
//   - `departure_delay`  duration in minutes (negative when early);
//   - `arrival_delay`    duration in minutes.
//
// External ids: the random identifier the flight got when it was followed
// (`ext:air-france-klm:flight:3f9a12c4`), never a flight number: the same
// number flies every day. `should_poll` stays false: the integration reads
// on its own timer, at a pace that follows the departure time.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, numericDate, statusText, routeText, departureText, arrivalText } from './i18n.js';
import { flightLabel } from './flights.js';

const DEVICE_TYPE = 'flight';
const FEATURE_KEYS = {
  STATUS: 'status',
  DEPARTURE: 'departure',
  ARRIVAL: 'arrival',
  DEPARTURE_DELAY: 'departure_delay',
  ARRIVAL_DELAY: 'arrival_delay',
};
// Two days either way: beyond, the flight is rescheduled, not delayed.
const DELAY_RANGE = { min: -2880, max: 2880 };
const TEXT_MAX = 250;

/**
 * @description The external ids of a followed flight.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} id - The identifier of the followed flight.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, id) => gladys.externalIds(DEVICE_TYPE, id);

/**
 * @description The followed flight a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {string|null} The identifier of the followed flight.
 * @example
 * flightIdOf('ext:air-france-klm:flight:3f9a12c4'); // -> '3f9a12c4'
 */
function flightIdOf(externalId) {
  const match = /:flight:([0-9a-f]{8})(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The name of the device of a followed flight.
 * @param {object} followed - The followed flight.
 * @param {object|null} snapshot - Its last snapshot.
 * @param {string} language - The language.
 * @returns {string} "Flight AF1234 CDG → NCE · 06/11".
 */
function deviceName(followed, snapshot, language) {
  const route =
    routeText(snapshot) ||
    (followed.origin && followed.destination ? `${followed.origin} → ${followed.destination}` : '');
  return t(route ? 'deviceNameRoute' : 'deviceName', language, {
    flight: flightLabel(followed),
    route,
    date: numericDate(followed.date, language),
  });
}

/**
 * @description A read-only text feature.
 * @param {object} feature - Its name and external id.
 * @returns {object} The feature.
 */
const text = (feature) => ({
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
  ...feature,
});

/**
 * @description A read-only delay, in minutes.
 * @param {object} feature - Its name and external id.
 * @returns {object} The feature.
 */
const delay = (feature) => ({
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...DELAY_RANGE,
  ...feature,
});

/**
 * @description Build the device of a followed flight.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed flight.
 * @param {object|null} snapshot - Its last snapshot.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildFlightDevice(gladys, followed, snapshot, language = 'fr') {
  const ids = idsOf(gladys, followed.id);
  return {
    name: deviceName(followed, snapshot, language).slice(0, 190),
    external_id: ids.device,
    model: snapshot?.airline
      ? `${snapshot.airline} ${flightLabel(followed)}`.slice(0, 120)
      : 'Flight Status',
    should_poll: false,
    params: [
      { name: 'AFKL_FLIGHT', value: flightLabel(followed) },
      { name: 'AFKL_DATE', value: followed.date },
    ],
    features: [
      text({ name: t('featureStatus', language), external_id: ids.feature(FEATURE_KEYS.STATUS) }),
      text({
        name: t('featureDeparture', language),
        external_id: ids.feature(FEATURE_KEYS.DEPARTURE),
      }),
      text({ name: t('featureArrival', language), external_id: ids.feature(FEATURE_KEYS.ARRIVAL) }),
      delay({
        name: t('featureDepartureDelay', language),
        external_id: ids.feature(FEATURE_KEYS.DEPARTURE_DELAY),
      }),
      delay({
        name: t('featureArrivalDelay', language),
        external_id: ids.feature(FEATURE_KEYS.ARRIVAL_DELAY),
      }),
    ],
  };
}

/**
 * @description Bound a delay to the feature range.
 * @param {number} minutes - The delay.
 * @returns {number} Within DELAY_RANGE.
 */
const bounded = (minutes) => Math.min(DELAY_RANGE.max, Math.max(DELAY_RANGE.min, minutes));

/**
 * @description The states of a followed flight.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed flight.
 * @param {object} snapshot - Its last snapshot.
 * @param {string} language - The language.
 * @returns {object[]} `[{ device_feature_external_id, state | text }]`.
 */
function buildFlightStates(gladys, followed, snapshot, language) {
  const ids = idsOf(gladys, followed.id);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.STATUS),
      text: statusText(snapshot.status, language).slice(0, TEXT_MAX),
    },
  ];
  const departure = departureText(snapshot, language);
  if (departure) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.DEPARTURE),
      text: departure.slice(0, TEXT_MAX),
    });
  }
  const arrival = arrivalText(snapshot, language);
  if (arrival) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.ARRIVAL),
      text: arrival.slice(0, TEXT_MAX),
    });
  }
  // A cancelled flight has no delay: its scheduled times stay in the texts.
  if (snapshot.status !== 'cancelled') {
    for (const [key, value] of [
      [FEATURE_KEYS.DEPARTURE_DELAY, snapshot.departure?.delay],
      [FEATURE_KEYS.ARRIVAL_DELAY, snapshot.arrival?.delay],
    ]) {
      if (Number.isFinite(value)) {
        states.push({ device_feature_external_id: ids.feature(key), state: bounded(value) });
      }
    }
  }
  return states;
}

export {
  DEVICE_TYPE,
  FEATURE_KEYS,
  DELAY_RANGE,
  idsOf,
  flightIdOf,
  deviceName,
  buildFlightDevice,
  buildFlightStates,
};
