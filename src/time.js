// -----------------------------------------------------------------------------
// Dates, times and durations of the flights.
//
// The Flight Status API writes every time in the local time of its airport,
// with its offset ("2025-05-18T19:30:00.000+02:00"): the text is shown as it
// is ("19:30"), the way airports and boarding passes show it, and parsed to
// an instant for the computations. Durations are ISO 8601 ("PT17M",
// "PT-1M", "PT1H5M"). The dates users type ("06/11", "tomorrow") are read
// in the timezone of the instance, the one the Gladys supervisor gives the
// container.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

/**
 * @description The date of an instant in the timezone of the instance.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - A timezone (tests); the one of the process otherwise.
 * @returns {string} `YYYY-MM-DD`.
 * @example
 * localDate(Date.parse('2026-10-30T23:30:00Z'), 'Europe/Paris'); // -> '2026-10-31'
 */
function localDate(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * @description The hour and minutes of an instant in the timezone of the instance.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - A timezone (tests).
 * @returns {string} `HH:MM`.
 */
function localTime(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    ...(timeZone ? { timeZone } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

/**
 * @description Whether a text is a real calendar date.
 * @param {unknown} value - The value.
 * @returns {boolean} True for `2026-11-06`, false for `2026-02-30`.
 */
function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/**
 * @description A date some days later (or earlier).
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} days - Days to add.
 * @returns {string} `YYYY-MM-DD`.
 * @example
 * addDays('2026-10-30', 3); // -> '2026-11-02'
 */
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @description Days from a date to another.
 * @param {string} from - `YYYY-MM-DD`.
 * @param {string} to - `YYYY-MM-DD`.
 * @returns {number} Whole days, negative when `to` is before `from`.
 */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * @description The instant of a time of the API.
 * @param {unknown} value - "2025-05-18T19:30:00.000+02:00".
 * @returns {number|null} The instant in ms, null when absent or invalid.
 */
function instantOf(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

/**
 * @description The local date and time of the airport, as the API writes them.
 * @param {unknown} value - "2025-05-18T19:30:00.000+02:00".
 * @returns {{ date: string, time: string }|null} `{ date: '2025-05-18', time: '19:30' }`.
 */
function airportClock(value) {
  const match = LOCAL_PATTERN.exec(typeof value === 'string' ? value : '');
  return match ? { date: match[1], time: `${match[2]}:${match[3]}` } : null;
}

/**
 * @description Minutes of an ISO 8601 duration of the API.
 * @param {unknown} value - "PT17M", "PT-1M", "-PT5M", "PT1H5M", "P1DT2H", "PT0S".
 * @returns {number|null} Whole minutes (rounded), null when absent or invalid.
 * @example
 * durationMinutes('PT1H5M'); // -> 65
 */
function durationMinutes(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match =
    /^([+-])?P(?:(-?\d+(?:\.\d+)?)D)?(?:T(?:(-?\d+(?:\.\d+)?)H)?(?:(-?\d+(?:\.\d+)?)M)?(?:(-?\d+(?:\.\d+)?)S)?)?$/.exec(
      value.trim().toUpperCase(),
    );
  if (!match || match.slice(2).every((part) => part === undefined)) {
    return null;
  }
  const [, sign, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60;
  const rounded = Math.round(total) * (sign === '-' ? -1 : 1);
  // No negative zero: "PT-0S" is on time.
  return rounded === 0 ? 0 : rounded;
}

// Words for today and tomorrow, in the four languages.
const TODAY_WORDS = new Set(['today', "aujourd'hui", 'aujourdhui', 'heute', 'hoy']);
const TOMORROW_WORDS = new Set(['tomorrow', 'demain', 'morgen', 'mañana', 'manana']);

/**
 * @description Read a date typed by a user or written by a scene: an ISO date
 * (`2026-11-06`), a European one (`06/11/2026`, `6/11`: the next 6 November),
 * today or tomorrow in one of the four languages, or `+3` (in three days).
 * @param {unknown} raw - The value.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @returns {string|null|undefined} `YYYY-MM-DD`, null when empty, undefined
 * when not understood.
 * @example
 * parseDateInput('6/11', '2026-10-30'); // -> '2026-11-06'
 */
function parseDateInput(raw, today) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw).trim().toLowerCase().replace(/’/g, "'");
  if (!text) {
    return null;
  }
  if (TODAY_WORDS.has(text)) {
    return today;
  }
  if (TOMORROW_WORDS.has(text)) {
    return addDays(today, 1);
  }
  const offset = /^\+\s*(\d{1,3})$/.exec(text);
  if (offset) {
    return addDays(today, Number(offset[1]));
  }
  if (isDate(text)) {
    return text;
  }
  const european = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (!european) {
    return undefined;
  }
  const [day, month] = [european[1].padStart(2, '0'), european[2].padStart(2, '0')];
  if (european[3]) {
    const year = european[3].length === 2 ? `20${european[3]}` : european[3];
    const date = `${year}-${month}-${day}`;
    return isDate(date) ? date : undefined;
  }
  // No year: the next such day, this year or the next one (yesterday counts:
  // a flight of last night is still followed).
  const year = Number(today.slice(0, 4));
  const yesterday = addDays(today, -1);
  for (const candidate of [`${year}-${month}-${day}`, `${year + 1}-${month}-${day}`]) {
    if (isDate(candidate) && candidate >= yesterday) {
      return candidate;
    }
  }
  return undefined;
}

export {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  localDate,
  localTime,
  isDate,
  addDays,
  daysBetween,
  instantOf,
  airportClock,
  durationMinutes,
  parseDateInput,
};
