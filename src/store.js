// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/air-france-klm.json
// (the only writable place of the container):
//   - `budget`    the calls of the day (`{ day, used }`): a restart does not
//                 give the quota back;
//   - `readings`  per followed flight, its last snapshot, when it was read
//                 and when it is due again (`{ snapshot, readAt, nextAt,
//                 signature }`): a restart shows the flights at once and does
//                 not read them all again;
//   - `seen`      per followed flight, what the scene triggers last saw
//                 (`{ status, delay, gate, signature }`): a restart neither
//                 fires again nor misses what changed meanwhile.
// `signature` holds the flight number, date and airports: another flight
// behind the same identifier starts from scratch.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/air-france-klm.json';
const EMPTY = () => ({ budget: { day: '', used: 0 }, readings: {}, seen: {} });

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const base = EMPTY();
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) => (value[name] && typeof value[name] === 'object' ? value[name] : {});
        // The budget object is changed in place by the budget of schedule.js.
        Object.assign(store.data.budget, base.budget, part('budget'));
        store.data.readings = { ...part('readings') };
        store.data.seen = { ...part('seen') };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        Object.assign(store.data.budget, EMPTY().budget);
        store.data.readings = {};
        store.data.seen = {};
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
