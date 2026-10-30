# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Air France and KLM flights: a
Node.js service (Node 22+, ESM, no build step) that runs in its own sandboxed
Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the **Flight Status API** of Air
France-KLM (Open Data, `https://api.airfranceklm.com/opendata/flightstatus`,
header `API-Key`) with the key of the user's own application on
https://developer.airfranceklm.com. The free plan allows 100 calls a day and
1 call a second. Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer
src/afkl-api.js         HTTP client of the Flight Status API: range, headers, 1 call/s, error kinds
src/flights.js          flight numbers, the operational flight of a date, segments, status, snapshot
src/schedule.js         when a flight is read again; the daily budget of calls
src/registry.js         the followed flights (setConfig registry), form readers
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the flight device and its states
src/widgets.js          flight and flights dashboard widgets
src/store.js            /data/air-france-klm.json: budget, readings, seen
src/time.js             airport local times, ISO durations, typed dates
src/config.js           configuration (key, language, daily limit) and internal keys
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          a real answer of the Flight Status API (18 May 2025), reduced
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`flight:<8 hex digits>`, the random identifier a
  followed flight gets, never a flight number; features `status`,
  `departure`, `arrival`, `departure_delay`, `arrival_delay`), feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema`, `actions` and their fields, the widgets and their
  settings, scene triggers (fields, the status keys of `flights.STATUSES`,
  variables) and scene actions (fields, outputs), and the internal config keys
  `flights` (one object per flight: `id`, `carrier`, `number`, `date`,
  `origin`, `destination`) and `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** Status, departure and arrival are `text` /
  `text`; the delays `duration` / `integer` in `minutes`, −2880 to 2880.
- **`should_poll` stays false**: a one-minute timer reads the flights that
  are due (src/schedule.js), never a `poll_frequency`.
- **Quota.** 100 calls a day, 1 a second on the free plan: every call goes
  through `createAfklClient` (spaced 1.1 s) and the budget (`/data`, per UTC
  day). The automatic readings keep a reserve of 5 calls for tests and scene
  actions; a 429 pauses them one hour. Never add a call per tick or per
  widget: widgets show the last reading.
- **Status from the times.** Partner flights publish leg statuses that do not
  follow the times ("ARRIVED" before take-off): the status comes from the
  flight status (cancelled, diverted), the actual times and the delay, never
  from `legStatusPublic`. Times are shown in the local time of the airport, as
  the API writes them.
- **Events once.** `seen` (in /data) remembers what the triggers last saw. The
  first reading of a flight is a baseline; published after "not published",
  only a delay, a cancellation or a diversion is news. A delay must move by
  15 minutes to fire again. A scene action or a widget never fires an event.
- **Trademarks.** Air France, KLM and their logos belong to their owners; the
  cover uses the Wikimedia Commons logos (see NOTICE). Say "not affiliated"
  in the README and the docs.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. The public reasons of the API come
  in the language it serves (`Accept-Language`), often English.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords`). Transport: `["cloud"]`. No permission; the key is a `secret`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake API of
  `test/helpers/fixtures.js`).
