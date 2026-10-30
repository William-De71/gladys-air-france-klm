// -----------------------------------------------------------------------------
// Entry point of the Air France-KLM external integration.
//
// Follows flights in Gladys through the Flight Status API of Air France-KLM
// (Open Data, the key of the user's own application on the developer portal):
//   - devices: one per followed flight, with its status, departure, arrival
//     and delays (src/device.js);
//   - scene triggers: status changed, delay changed, gate announced or changed;
//   - scene actions: read a followed flight, look up any flight;
//   - dashboard widgets: one flight, every followed flight.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Air France-KLM integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
