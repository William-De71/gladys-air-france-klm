// -----------------------------------------------------------------------------
// Configuration of the Air France-KLM integration.
//
// Fields of the config_schema:
//   - `api_key`      the key of the user's application on the developer
//                    portal of Air France-KLM (secret);
//   - `language`     language of the texts Gladys does not ask for in a
//                    language (device names, feature texts, scene
//                    summaries, public reasons of the API): `auto` follows
//                    the last widget request, French until then;
//   - `daily_limit`  calls a day the integration allows itself (100 on the
//                    free plan of the portal).
//
// Internal keys, outside the config_schema (never shown in the UI, stored by
// setConfig, so they live in the Gladys database and follow its backups):
//   - `flights`        the followed flights (registry.js);
//   - `last_language`  language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { readLimit } from './schedule.js';

const AUTO_LANGUAGE = 'auto';
const DEFAULT_LANGUAGE = 'fr';
const INTERNAL_KEYS = { flights: 'flights', language: 'last_language' };

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ apiKey: string, language: string, dailyLimit: number }} The settings.
 * @example
 * normalizeConfig({ language: 'de' }).language; // -> 'de'
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    apiKey: typeof config.api_key === 'string' ? config.api_key.trim() : '',
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
    dailyLimit: readLimit(config.daily_limit),
  };
}

/**
 * @description Read the stored language of the last widget request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'en' }, 'fr'); // -> 'en'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return isLanguage(language) ? language : fallback;
}

export { AUTO_LANGUAGE, DEFAULT_LANGUAGE, INTERNAL_KEYS, normalizeConfig, readLanguage };
