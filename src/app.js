// -----------------------------------------------------------------------------
// The Air France-KLM integration: every handler, registered on a Gladys client.
//
// Follows flights through the Flight Status API of Air France-KLM (Open
// Data, the key of the user's own application on the developer portal):
//   - devices (device.js): one per followed flight, added with the "Follow a
//     flight" button (registry.js): status, departure, arrival, delays;
//   - scene triggers (events.js): status changed, delay changed, gate;
//   - scene actions: read a followed flight, look up any flight;
//   - dashboard widgets (widgets.js): one flight, every followed flight.
//
// A timer checks every minute which flights are due (schedule.js: from every
// 12 hours a few days ahead to every 15 minutes around the departure), within
// a daily budget of calls (100 on the free plan). The last reading of each
// flight is kept in /data: a restart neither reads everything again nor
// gives the quota back. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, AUTO_LANGUAGE, DEFAULT_LANGUAGE } from './config.js';
import { createAfklClient, AfklError } from './afkl-api.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { createRegistry, RegistryError, readFlightFields, MAX_FLIGHTS } from './registry.js';
import { pickFlight, summarizeFlight, notFound, flightLabel, isFinished } from './flights.js';
import { nextReadDelay, createBudget } from './schedule.js';
import { buildFlightDevice, buildFlightStates, idsOf, flightIdOf } from './device.js';
import {
  TRIGGERS,
  FLIGHT_OUTPUTS,
  detectChanges,
  eventData,
  flightOutputs,
  pick,
} from './events.js';
import { WIDGETS, messageContent, buildFlightWidget, buildFlightsWidget } from './widgets.js';
import { localDate, MINUTE_MS, HOUR_MS } from './time.js';
import { t, all, numericDate, statusText, routeText, isLanguage } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  ADD_FLIGHT: 'add_flight',
  REMOVE_FLIGHT: 'remove_flight',
  LIST_FLIGHTS: 'list_flights',
};
const SCENE_ACTIONS = { GET_FLIGHT: 'get_flight', LOOK_UP_FLIGHT: 'look_up_flight' };
const TICK_INTERVAL_MS = MINUTE_MS;
// A failed reading is tried again after this long.
const RETRY_MS = 15 * MINUTE_MS;
// After a 429 of the portal, no automatic reading for this long.
const QUOTA_PAUSE_MS = HOUR_MS;
// A scene action reads a followed flight again when its reading is older.
const FRESH_MS = 10 * MINUTE_MS;
// A looked-up flight is reused this long.
const LOOKUP_CACHE_MS = 15 * MINUTE_MS;
const LOOKUP_CACHE_MAX = 20;
const ACTION_TEXT_MAX = 1500;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description The signature of a followed flight: another flight behind the
 * same identifier starts from scratch.
 * @param {object} followed - The followed flight.
 * @returns {string} The signature.
 */
const signatureOf = (followed) =>
  [
    followed.carrier,
    followed.number,
    followed.date,
    followed.origin ?? '',
    followed.destination ?? '',
  ].join('|');

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.fetch] - The fetch function.
 * @param {string} [options.baseUrl] - The root of the API.
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise` between two calls.
 * @param {string} [options.timeZone] - The timezone of "today" (tests).
 * @param {boolean} [options.timers] - Start the timer (false in tests).
 * @param {Function} [options.newId] - Identifiers of the flights (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The internals the tests drive.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    sleep,
    timeZone,
    timers = true,
    newId,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = DEFAULT_LANGUAGE;
  let createdDevices = new Set();
  // Errors: of the key or the quota (every flight), or of one flight.
  let globalError = null;
  const flightErrors = new Map();
  const retryAt = new Map();
  const pending = new Map();
  // "AF1234|2026-11-06" -> { snapshot, readAt }, for the look-up scene action.
  const lookups = new Map();
  let quotaPausedUntil = 0;
  let lastStatus = null;
  let lastDiscovery = null;
  let tickTimer = null;
  let ticking = null;
  let stopped = false;

  const store = createStore({ path: storePath, logger });
  const budget = createBudget(store.data.budget, { now, limit: () => config.dailyLimit });
  const api = createAfklClient({
    now,
    onRequest: () => budget.count(),
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(sleep ? { sleep } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const registry = createRegistry(gladys, { logger, ...(newId ? { newId } : {}) });
  const today = () => localDate(now(), timeZone);

  /**
   * @description Remember the language of a widget request, and store it when
   * it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!isLanguage(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ last_language: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err instanceof RegistryError) {
      return t(err.key, lang, err.params);
    }
    const detail = String(err?.message ?? err).slice(0, 80);
    switch (err?.kind) {
      case 'auth':
        return api.hasKey() ? t('errorAuth', lang, { detail }) : t('errorNoKey', lang);
      case 'quota':
        return t('errorQuota', lang);
      case 'budget':
        return t('errorBudget', lang, { limit: config.dailyLimit });
      default:
        return t('errorUnreachable', lang, { detail });
    }
  }

  /**
   * @description An error a configuration action shows under its button.
   * @param {Error} err - The error.
   * @returns {Error} An error whose message is written for the user.
   */
  const userError = (err) => new Error(errorText(err, textLanguage()), { cause: err });

  // --- Readings ------------------------------------------------------------------------

  /**
   * @description The last reading of a followed flight, when it is still its own.
   * @param {object} followed - The followed flight.
   * @returns {object|null} `{ snapshot, readAt, nextAt }`.
   */
  function readingOf(followed) {
    const reading = store.data.readings[followed.id];
    return reading?.signature === signatureOf(followed) && reading.snapshot ? reading : null;
  }

  /**
   * @description Ask the API for a flight.
   * @param {object} followed - `{ carrier, number, date, origin, destination }`.
   * @param {object} options - `{ automatic }`: an automatic reading keeps
   * the reserve of the budget and waits after a 429.
   * @returns {Promise<object>} Its snapshot.
   */
  async function fetchSnapshot(followed, { automatic }) {
    if (!api.hasKey()) {
      throw new AfklError('auth', 'no API key');
    }
    if (automatic && now() < quotaPausedUntil) {
      throw new AfklError('quota', 'paused');
    }
    if (!budget.allows(automatic)) {
      throw new AfklError('budget', 'daily limit');
    }
    try {
      const list = await api.flights({ ...followed, language: textLanguage() });
      globalError = null;
      const flight = pickFlight(list, followed);
      return flight ? summarizeFlight(flight, followed) : notFound(followed);
    } catch (err) {
      if (err.kind === 'quota') {
        quotaPausedUntil = now() + QUOTA_PAUSE_MS;
      }
      if (err.kind === 'auth' || err.kind === 'quota') {
        globalError = err;
      }
      throw err;
    } finally {
      await store.save();
    }
  }

  /**
   * @description Take a new snapshot of a followed flight into account: keep
   * it, fire its scene events, publish its states.
   * @param {object} followed - The followed flight.
   * @param {object} snapshot - Its snapshot.
   * @param {object} [options] - `{ events }`: false for a baseline.
   * @returns {Promise<object>} The reading.
   */
  async function adopt(followed, snapshot, { events = true } = {}) {
    const delay = nextReadDelay(snapshot, followed, { now: now(), today: today() });
    const reading = {
      snapshot,
      readAt: now(),
      nextAt: delay === null ? null : now() + delay,
      signature: signatureOf(followed),
    };
    store.data.readings[followed.id] = reading;
    flightErrors.delete(followed.id);
    retryAt.delete(followed.id);
    await digestEvents(followed, snapshot, { events });
    await store.save();
    await publishDiscoveredDevices();
    await publishFlightStates(followed);
    return reading;
  }

  /**
   * @description Read a followed flight.
   * @param {object} followed - The followed flight.
   * @param {object} [options] - `{ automatic, events }`.
   * @returns {Promise<object|null>} Its reading, null on an error.
   */
  async function readFlight(followed, { automatic = true, events = true } = {}) {
    if (pending.has(followed.id)) {
      return pending.get(followed.id);
    }
    const run = (async () => {
      try {
        const snapshot = await fetchSnapshot(followed, { automatic });
        return await adopt(followed, snapshot, { events });
      } catch (err) {
        if (!['auth', 'quota', 'budget'].includes(err.kind)) {
          flightErrors.set(followed.id, err);
        }
        retryAt.set(followed.id, now() + RETRY_MS);
        logger.warn(`Unable to read ${flightLabel(followed)} of ${followed.date}: ${err.message}`);
        if (!automatic) {
          throw err;
        }
        return null;
      } finally {
        pending.delete(followed.id);
      }
    })();
    pending.set(followed.id, run);
    return run;
  }

  /**
   * @description Whether a followed flight is due for a reading.
   * @param {object} followed - The followed flight.
   * @returns {boolean} True when due.
   */
  function isDue(followed) {
    if ((retryAt.get(followed.id) ?? 0) > now()) {
      return false;
    }
    const reading = readingOf(followed);
    if (!reading) {
      return true;
    }
    return reading.nextAt !== null && reading.nextAt <= now();
  }

  /**
   * @description Read every flight that is due, within the budget.
   * @returns {Promise<void>}
   */
  async function tick() {
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      try {
        const dropped = await registry.prune(today());
        for (const followed of dropped) {
          forget(followed.id);
        }
        if (dropped.length) {
          await store.save();
          await publishDiscoveredDevices();
        }
      } catch (err) {
        logger.warn(`Unable to drop the old flights: ${err.message}`);
      }
      let read = false;
      if (api.hasKey() && now() >= quotaPausedUntil) {
        for (const followed of registry.list()) {
          if (stopped) {
            break;
          }
          if (!isDue(followed)) {
            continue;
          }
          if (!budget.allows(true)) {
            globalError = new AfklError('budget', 'daily limit');
            break;
          }
          await readFlight(followed);
          read = true;
        }
      }
      if (globalError?.kind === 'budget' && budget.allows(true)) {
        globalError = null;
      }
      await refreshStatus();
      if (read) {
        refreshWidgets();
      }
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  /**
   * @description Forget what was kept of a flight.
   * @param {string} id - The followed flight.
   */
  function forget(id) {
    delete store.data.readings[id];
    delete store.data.seen[id];
    flightErrors.delete(id);
    retryAt.delete(id);
  }

  // --- Status ------------------------------------------------------------------------

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!api.hasKey()) {
      await reportStatus(false, all('statusNoKey'));
      return;
    }
    if (globalError) {
      await reportStatus(false, errorAll(globalError));
      return;
    }
    const count = registry.list().length;
    if (!count) {
      await reportStatus(true, all('statusNoFlight'));
      return;
    }
    await reportStatus(
      true,
      all('statusOk', { count, used: budget.used(), limit: config.dailyLimit }),
    );
  }

  /**
   * @description The message of an error, in the four languages.
   * @param {Error} err - The error.
   * @returns {object} `{ en, fr, de, es }`.
   */
  const errorAll = (err) =>
    Object.fromEntries(['en', 'fr', 'de', 'es'].map((lang) => [lang, errorText(err, lang)]));

  // --- Devices -----------------------------------------------------------------------

  /**
   * @description Read the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set((devices ?? []).map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Offer the device of every followed flight on the Discovery screen.
   * @param {boolean} [force] - Publish even when nothing changed.
   * @returns {Promise<number>} The number of devices offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = registry
      .list()
      .map((followed) =>
        buildFlightDevice(gladys, followed, readingOf(followed)?.snapshot ?? null, textLanguage()),
      );
    const signature = JSON.stringify(devices);
    if (!force && signature === lastDiscovery) {
      return devices.length;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
    return devices.length;
  }

  /**
   * @description Publish the states of a followed flight, when its device exists.
   * @param {object} followed - The followed flight.
   * @returns {Promise<void>}
   */
  async function publishFlightStates(followed) {
    const reading = readingOf(followed);
    if (!reading || !createdDevices.has(idsOf(gladys, followed.id).device)) {
      return;
    }
    try {
      await gladys.publishChangedStates(
        buildFlightStates(gladys, followed, reading.snapshot, textLanguage()),
        { heartbeat: 6 * HOUR_MS },
      );
    } catch (err) {
      logger.warn(`Unable to publish the states of ${flightLabel(followed)}: ${err.message}`);
    }
  }

  /**
   * @description Fire the scene events of a new snapshot, and remember it.
   * @param {object} followed - The followed flight.
   * @param {object} snapshot - Its snapshot.
   * @param {object} options - `{ events }`: false for a baseline.
   * @returns {Promise<void>}
   */
  async function digestEvents(followed, snapshot, { events }) {
    const signature = signatureOf(followed);
    const seen = store.data.seen[followed.id];
    const previous = events && seen?.signature === signature ? seen : null;
    const { changes, memory } = detectChanges(previous, snapshot);
    const deviceId = idsOf(gladys, followed.id).device;
    for (const change of changes) {
      try {
        await gladys.publishSceneEvent(
          change.key,
          eventData(change, { followed, snapshot, deviceId, language: textLanguage() }),
        );
      } catch (err) {
        logger.warn(`Unable to fire ${change.key}: ${err.message}`);
      }
    }
    store.data.seen[followed.id] = { ...memory, signature };
  }

  /**
   * @description Ask the dashboards to pull the widgets again.
   */
  function refreshWidgets() {
    for (const key of Object.values(WIDGETS)) {
      try {
        gladys.requestWidgetRefresh?.(key);
      } catch (err) {
        logger.debug?.(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    }
  }

  // --- Widgets -----------------------------------------------------------------------

  gladys.onWidgetGet(WIDGETS.FLIGHT, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!settings.flight) {
      return messageContent(t('widgetNoFlight', lang));
    }
    const followed = registry.byId(flightIdOf(settings.flight));
    if (!followed) {
      return messageContent(t('errorUnknownDevice', lang));
    }
    const reading = readingOf(followed);
    if (!reading) {
      const err = flightErrors.get(followed.id) ?? globalError;
      return messageContent(err ? errorText(err, lang) : t('widgetNotRead', lang));
    }
    return buildFlightWidget({
      followed,
      snapshot: reading.snapshot,
      readAt: reading.readAt,
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetGet(WIDGETS.FLIGHTS, async ({ language: lang }) => {
    rememberLanguage(lang);
    const rows = registry
      .list()
      .map((followed) => ({ followed, snapshot: readingOf(followed)?.snapshot ?? null }));
    return buildFlightsWidget({
      rows,
      used: budget.used(),
      limit: config.dailyLimit,
      language: lang,
    });
  });

  // --- Scene actions -----------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.GET_FLIGHT, async (fields = {}) => {
    const lang = textLanguage();
    const followed = registry.byId(flightIdOf(fields.flight));
    if (!followed) {
      throw new Error(t('errorUnknownDevice', lang));
    }
    let reading = readingOf(followed);
    const stale = !reading || (now() - reading.readAt > FRESH_MS && !isFinished(reading.snapshot));
    if (stale) {
      try {
        reading = (await readFlight(followed, { automatic: false })) ?? reading;
      } catch (err) {
        if (!reading) {
          throw new Error(errorText(err, lang), { cause: err });
        }
        // An older reading is better than nothing.
      }
    }
    return pick(flightOutputs(followed, reading.snapshot, lang), FLIGHT_OUTPUTS);
  });

  gladys.onSceneAction(SCENE_ACTIONS.LOOK_UP_FLIGHT, async (fields = {}) => {
    const lang = textLanguage();
    try {
      const searched = readFlightFields(
        { flight: fields.flight_number, date: fields.date || today() },
        today(),
      );
      const key = `${flightLabel(searched)}|${searched.date}`;
      const cached = lookups.get(key);
      let snapshot = cached && now() - cached.readAt < LOOKUP_CACHE_MS ? cached.snapshot : null;
      if (!snapshot) {
        snapshot = await fetchSnapshot(searched, { automatic: false });
        lookups.set(key, { snapshot, readAt: now() });
        while (lookups.size > LOOKUP_CACHE_MAX) {
          lookups.delete(lookups.keys().next().value);
        }
      }
      return pick(flightOutputs(searched, snapshot, lang), FLIGHT_OUTPUTS);
    } catch (err) {
      await refreshStatus();
      throw new Error(errorText(err, lang), { cause: err });
    }
  });

  // --- Configuration actions -----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    try {
      // Any flight number of the day: only the answer of the API matters.
      await fetchSnapshot(
        { carrier: 'AF', number: 1, date: today(), origin: null, destination: null },
        { automatic: false },
      );
      await refreshStatus();
      return all('testOk', { used: budget.used(), limit: config.dailyLimit });
    } catch (err) {
      await refreshStatus();
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.ADD_FLIGHT, async (fields = {}) => {
    try {
      const wanted = readFlightFields(fields, today());
      if (registry.list().length >= MAX_FLIGHTS) {
        throw new RegistryError('errorTooManyFlights', { max: MAX_FLIGHTS });
      }
      if (!api.hasKey()) {
        throw new AfklError('auth', 'no API key');
      }
      // Read first: a refused key adds nothing; a spent budget adds the
      // flight, read later.
      let snapshot = null;
      try {
        snapshot = await fetchSnapshot(wanted, { automatic: false });
      } catch (err) {
        if (err.kind !== 'budget') {
          throw err;
        }
      }
      const followed = await registry.add(wanted);
      forget(followed.id);
      if (snapshot) {
        await adopt(followed, snapshot, { events: false });
      } else {
        await publishDiscoveredDevices();
      }
      await refreshStatus();
      refreshWidgets();
      const values = (lang) => ({
        flight: flightLabel(followed),
        date: numericDate(followed.date, lang),
        status: snapshot ? statusText(snapshot.status, lang).toLowerCase() : '',
      });
      if (!snapshot) {
        return all('flightAddedLater', values);
      }
      return all(snapshot.status === 'not_found' ? 'flightAddedNotFound' : 'flightAdded', values);
    } catch (err) {
      await refreshStatus();
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.REMOVE_FLIGHT, async (fields = {}) => {
    try {
      const followed = registry.find(fields.flight);
      await registry.remove(followed.id);
      forget(followed.id);
      await store.save();
      await publishDiscoveredDevices();
      await refreshStatus();
      refreshWidgets();
      return all('flightRemoved', (lang) => ({
        flight: flightLabel(followed),
        date: numericDate(followed.date, lang),
      }));
    } catch (err) {
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.LIST_FLIGHTS, async () => {
    const lang = textLanguage();
    const flights = registry.list();
    if (!flights.length) {
      return t('flightsNone', lang);
    }
    const lines = flights.map((followed, index) => {
      const snapshot = readingOf(followed)?.snapshot;
      const route = snapshot ? routeText(snapshot) : '';
      return t('flightLine', lang, {
        index: index + 1,
        flight: flightLabel(followed),
        date: numericDate(followed.date, lang),
        route: route ? ` · ${route}` : '',
        status: snapshot ? statusText(snapshot.status, lang) : t('notReadYet', lang),
      });
    });
    const text = `${t('flightsList', lang, {
      count: flights.length,
      used: budget.used(),
      limit: config.dailyLimit,
    })}\n${lines.join('\n')}`;
    return text.slice(0, ACTION_TEXT_MAX);
  });

  // --- Discovery and devices -----------------------------------------------------------

  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const followed of registry.list()) {
      await publishFlightStates(followed);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = (await gladys.getConfig()) ?? {};
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
      registry.load(raw);
    } catch (err) {
      // The form values may lack the internal keys: keep the flights in memory.
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
    api.setKey(config.apiKey);
  }

  gladys.onConfigUpdated(async (raw) => {
    const before = { language: textLanguage(), key: config.apiKey };
    await loadConfig(raw);
    if (config.apiKey !== before.key) {
      globalError = null;
      quotaPausedUntil = 0;
      retryAt.clear();
    }
    if (textLanguage() !== before.language) {
      // Device names follow the language until a device is created.
      await publishDiscoveredDevices();
      for (const followed of registry.list()) {
        await publishFlightStates(followed);
      }
    }
    await tick();
    logger.info('Configuration updated');
  });

  // --- Timer -------------------------------------------------------------------------

  function schedule() {
    if (!timers || tickTimer) {
      return;
    }
    tickTimer = setInterval(() => {
      tick().catch((err) => logger.error('Tick', err));
    }, TICK_INTERVAL_MS);
  }

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      logger.info(`Air France-KLM ${VERSION}: resynchronizing`);
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await publishDiscoveredDevices();
      for (const followed of registry.list()) {
        await publishFlightStates(followed);
      }
      await tick();
      schedule();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(tickTimer);
    await store.save();
  });

  return {
    api,
    store,
    budget,
    registry,
    tick,
    readFlight,
    readingOf,
    getGlobalError: () => globalError,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  TRIGGERS,
  TICK_INTERVAL_MS,
  RETRY_MS,
  QUOTA_PAUSE_MS,
  FRESH_MS,
  LOOKUP_CACHE_MS,
};
