// On-device storage (IndexedDB). Everything the app knows lives here.
// This is the one module to swap if the recipes ever move to a shared database.

const DB_NAME = 'recipe-book';
const DB_VERSION = 1;
const STORE = 'recipes';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export async function listRecipes() {
  const rows = await tx('readonly', (s) => s.getAll());
  return rows || [];
}

export function getRecipe(id) {
  return tx('readonly', (s) => s.get(id));
}

export function putRecipe(recipe) {
  return tx('readwrite', (s) => s.put(recipe));
}

export function deleteRecipe(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export function putMany(recipes) {
  return tx('readwrite', (s) => {
    for (const r of recipes) s.put(r);
  });
}

export async function persistStorage() {
  // Asks the browser not to evict our data under storage pressure. Best-effort.
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) {
    /* ignore */
  }
  return false;
}
