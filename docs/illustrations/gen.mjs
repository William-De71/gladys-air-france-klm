// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on the afternoon of 18 May 2025: the flights of the real
// answer of the Flight Status API kept in test/fixtures go through the real
// parsers (src/flights.js) and the real widget builders (src/widgets.js).
// The `flight` card shows KL 835 before its take-off, with the delay of
// 40 minutes and the public reason the API gave for it that evening.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildFlightWidget, buildFlightsWidget } = await load('src/widgets.js');
const { pickFlight, summarizeFlight } = await load('src/flights.js');
const { LANGUAGES } = await load('src/i18n.js');
const { beforeTakeOff, flight } = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Sunday 18 May 2025, 18:00 in Paris; read at 17:55.
const NOW = Date.parse('2025-05-18T16:00:00Z');
const READ_AT = NOW - 5 * 60 * 1000;
const TIME_ZONE = 'Europe/Paris';

const followed = (id, carrier, number, fields = {}) => ({
  id,
  carrier,
  number,
  date: '2025-05-18',
  origin: null,
  destination: null,
  ...fields,
});
// KL 835 before take-off, 40 minutes late, with the reason of the evening.
const late = beforeTakeOff('20250518+KL+0835');
late.flightLegs[0].departureInformation.times.latestPublished = '2025-05-18T21:30:00.000+02:00';
late.flightLegs[0].irregularity = flight('20250518+KL+0835').flightLegs[0].irregularity;
const flights = [
  [followed('0000000a', 'KL', 835), [late]],
  [followed('0000000b', 'AF', 27), [flight('20250518+AF+0027')]],
  [followed('0000000c', 'SS', 774, { destination: 'RUN' }), [flight('20250518+SS+0774')]],
  [followed('0000000d', 'KL', 807), [flight('20250518+KL+0807')]],
].map(([entry, list]) => ({
  followed: entry,
  snapshot: summarizeFlight(pickFlight(list, entry), entry),
}));
const rows = [
  ...flights,
  {
    followed: followed('0000000e', 'AF', 1234, { date: '2025-05-24' }),
    snapshot: null,
  },
];

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    flight: buildFlightWidget({
      ...flights[0],
      readAt: READ_AT,
      language,
      timeZone: TIME_ZONE,
    }),
    flights: buildFlightsWidget({ rows, used: 23, limit: 100, language }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
