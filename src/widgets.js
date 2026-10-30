// -----------------------------------------------------------------------------
// Dashboard widgets (core vocabulary, no HTML).
//
//   - `flight`   one followed flight: its route, departure and arrival times,
//                gate (baggage belt once landed), status, delay and aircraft,
//                and the public reason of a delay or a cancellation;
//   - `flights`  every followed flight in one list, with its status badge,
//                and the calls used today.
//
// Every widget says when the data was read: Air France-KLM publishes, the
// integration reads at its own pace (src/schedule.js).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, dateText, statusText, delayText, routeText, clockText, terminalText } from './i18n.js';
import { flightLabel, currentDelay } from './flights.js';
import { localTime } from './time.js';

const WIDGETS = { FLIGHT: 'flight', FLIGHTS: 'flights' };
const LIST_MAX = 8;
const TTL_SECONDS = 120;
const STATUS_COLORS = {
  on_time: WIDGET_COLORS.SUCCESS,
  delayed: WIDGET_COLORS.WARNING,
  departed: WIDGET_COLORS.PRIMARY,
  arrived: WIDGET_COLORS.SUCCESS,
  cancelled: WIDGET_COLORS.DANGER,
  diverted: WIDGET_COLORS.DANGER,
  not_found: WIDGET_COLORS.NEUTRAL,
};

/**
 * @description The color of a delay.
 * @param {number|null} minutes - The delay.
 * @returns {string} A WIDGET_COLORS value.
 */
function delayColor(minutes) {
  if (minutes === null || minutes < 15) {
    return WIDGET_COLORS.SUCCESS;
  }
  return minutes >= 60 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING;
}

/**
 * @description A widget content that only says something.
 * @param {string} text - The message.
 * @returns {object} The content.
 */
const messageContent = (text) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text: text.slice(0, 300) }],
});

/**
 * @description The caption with the time of the reading.
 * @param {number|null} readAt - When the flight was read (ms).
 * @param {string} language - The language.
 * @param {string} [timeZone] - A timezone (tests).
 * @returns {object|null} The caption component.
 */
function sourceCaption(readAt, language, timeZone) {
  if (!Number.isFinite(readAt)) {
    return null;
  }
  return {
    type: 'text',
    variant: 'caption',
    text: t('widgetSource', language, { time: localTime(readAt, timeZone) }).slice(0, 80),
  };
}

/**
 * @description The `flight` widget.
 * @param {object} options - `{ followed, snapshot, readAt, language, timeZone }`.
 * @returns {object} The content.
 */
function buildFlightWidget({ followed, snapshot, readAt, language, timeZone }) {
  const route = routeText(snapshot, { cities: true }) || routeText(snapshot);
  const heading = [flightLabel(followed), route || dateText(followed.date, language)]
    .filter(Boolean)
    .join(' · ');
  const components = [{ type: 'text', variant: 'heading', text: heading.slice(0, 40) }];
  if (snapshot.status === 'not_found') {
    components.push({
      type: 'status',
      items: [
        {
          label: t('widgetStatus', language),
          value: statusText(snapshot.status, language),
          icon: 'clock',
          color: STATUS_COLORS.not_found,
        },
      ],
    });
    const caption = sourceCaption(readAt, language, timeZone);
    if (caption) {
      components.push(caption);
    }
    return { ttl_seconds: TTL_SECONDS, components };
  }
  // Tiles hold 12 characters: the local time alone, no "(+1)".
  const departure = clockText(snapshot.departure.best);
  const arrival = clockText(snapshot.arrival.best);
  if (departure) {
    components.push({
      type: 'value',
      value: departure.slice(0, 12),
      label: `${t('widgetDeparture', language)} ${snapshot.departure.airport}`.slice(0, 24),
      icon: 'log-out',
      color: delayColor(snapshot.departure.delay),
    });
  }
  if (arrival) {
    components.push({
      type: 'value',
      value: arrival.slice(0, 12),
      label: `${t('widgetArrival', language)} ${snapshot.arrival.airport}`.slice(0, 24),
      icon: 'log-in',
      color: delayColor(snapshot.arrival.delay),
    });
  }
  // The gate until take-off, the baggage belt once landed.
  if (snapshot.status === 'arrived' && snapshot.arrival.belt) {
    components.push({
      type: 'value',
      value: snapshot.arrival.belt.slice(0, 12),
      label: t('widgetBelt', language),
      icon: 'briefcase',
      color: WIDGET_COLORS.INFO,
    });
  } else if (snapshot.departure.gate && !['arrived', 'cancelled'].includes(snapshot.status)) {
    components.push({
      type: 'value',
      value: snapshot.departure.gate.slice(0, 12),
      label: t('widgetGate', language),
      icon: 'map-pin',
      color: WIDGET_COLORS.INFO,
    });
  }
  const items = [
    {
      label: t('widgetStatus', language),
      value: statusText(snapshot.status, language),
      icon: snapshot.status === 'cancelled' ? 'x-circle' : 'navigation',
      color: STATUS_COLORS[snapshot.status] ?? WIDGET_COLORS.NEUTRAL,
    },
  ];
  const delay = currentDelay(snapshot);
  if (delay !== null && snapshot.status !== 'cancelled') {
    items.push({
      label: t('widgetDelay', language),
      value: delayText(delay, language),
      icon: 'clock',
      color: delayColor(delay),
    });
  }
  const scheduled = [
    clockText(snapshot.departure.scheduled),
    clockText(snapshot.arrival.scheduled, snapshot.departure.scheduled),
  ]
    .filter(Boolean)
    .join(' → ');
  if (scheduled) {
    items.push({ label: t('widgetScheduled', language), value: scheduled, icon: 'calendar' });
  }
  const terminals = [
    [snapshot.departure.airport, snapshot.departure.terminal],
    [snapshot.arrival.airport, snapshot.arrival.terminal],
  ]
    .filter(([, terminal]) => terminal)
    .map(([airport, terminal]) => `${airport} ${terminalText(terminal, language)}`)
    .join(' · ');
  if (terminals) {
    items.push({
      label: t('widgetTerminal', language),
      value: terminals.slice(0, 40),
      icon: 'home',
    });
  }
  if (snapshot.aircraft?.type) {
    items.push({
      label: t('widgetAircraft', language),
      value: snapshot.aircraft.type.slice(0, 40),
      icon: 'send',
    });
  }
  components.push({ type: 'status', items });
  // Two texts at most: the heading, then the reason or the time of the data.
  if (snapshot.reason) {
    components.push({ type: 'text', variant: 'body', text: snapshot.reason.slice(0, 300) });
  } else {
    const caption = sourceCaption(readAt, language, timeZone);
    if (caption) {
      components.push(caption);
    }
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The `flights` widget.
 * @param {object} options - `{ rows, used, limit, language }`: `rows` are `{
 * followed, snapshot }`, `snapshot` null for a flight never read.
 * @returns {object} The content.
 */
function buildFlightsWidget({ rows, used, limit, language }) {
  if (!rows.length) {
    return messageContent(t('widgetNoFlights', language));
  }
  const items = rows.slice(0, LIST_MAX).map(({ followed, snapshot }) => {
    const route = snapshot ? routeText(snapshot) : '';
    const title = [flightLabel(followed), route].filter(Boolean).join(' · ');
    const times =
      snapshot && snapshot.status !== 'not_found'
        ? [
            clockText(snapshot.departure.best),
            clockText(snapshot.arrival.best, snapshot.departure.best),
          ]
            .filter(Boolean)
            .join(' → ')
        : '';
    const subtitle = [dateText(followed.date, language), times].filter(Boolean).join(' · ');
    const status = snapshot?.status;
    const delay = snapshot ? currentDelay(snapshot) : null;
    const badge =
      status === 'delayed' && delay !== null
        ? delayText(delay, language)
        : status
          ? statusText(status, language)
          : t('notReadYet', language);
    return {
      title: title.slice(0, 60),
      subtitle: subtitle.slice(0, 60),
      badge: {
        text: badge.slice(0, 16),
        color: STATUS_COLORS[status] ?? WIDGET_COLORS.NEUTRAL,
      },
    };
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      { type: 'card-list', display: 'list', items },
      {
        type: 'text',
        variant: 'caption',
        text: t('widgetBudget', language, { used, limit }).slice(0, 80),
      },
    ],
  };
}

export {
  WIDGETS,
  LIST_MAX,
  TTL_SECONDS,
  STATUS_COLORS,
  delayColor,
  messageContent,
  sourceCaption,
  buildFlightWidget,
  buildFlightsWidget,
};
