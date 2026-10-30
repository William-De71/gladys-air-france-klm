# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-30

### Added

- One device per followed flight (up to 10, added with the "Follow a flight" button: a flight number such as AF1234 and its date, and for a flight with stops the airports the passenger boards and leaves at): flight status, departure and arrival (time, scheduled time, terminal, gate, baggage belt) and the departure and arrival delays in minutes.
- Scene triggers: flight status changed (delayed, in flight, landed, cancelled, diverted, with a status filter), delay changed by 15 minutes or more, gate announced or changed.
- Scene actions: read a followed flight, look up any flight on a date without following it; both give the times, the delays, the gate, the baggage belt, the reason given by the airline and a summary sentence.
- Dashboard widgets: one flight (times, gate or baggage belt, status, delay, aircraft, reason of a delay or a cancellation) and every followed flight in one list with its status, and the calls used today.
- Cloud transport: the official Flight Status API of Air France-KLM, with the free key of the user's own application; each flight is read more often as its departure gets closer, within a daily limit of calls (100 on the free plan), and the readings are kept across restarts.
- Texts in English, French, German and Spanish.

[0.1.0]: https://github.com/William-De71/gladys-air-france-klm/releases/tag/v0.1.0
