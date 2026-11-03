// IndexedDB-backed persistence — the primary store for v2.
//
// localStorage (~5MB, synchronous, silently cleared with site data) was the only
// store in v1. Here the whole workspace state lives in IndexedDB (large quota,
// async), while localStorage stays as a fast-boot cache and fallback. The device
// file mirror (lib/persist.js) is unchanged and still the way to own a real file.
//
// Shape: one record { state, savedAt } under DB/STORE/KEY.

const DB = "aetheris-v2";
const STORE = "kv";
const KEY = "state";

export const idbSupported = () =>
  typeof indexedDB !== "undefined" && typeof window !== "undefined";

const openDb = () =>
  new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async (mode, fn) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let out;
      try {
        out = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      if (out && typeof out.then === "function") {
        out.then(resolve, reject);
        return;
      }
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
};

// → { state, savedAt } | null. Never throws — boot must not depend on this.
export const getStoredState = async () => {
  if (!idbSupported()) return null;
  try {
    return await tx("readonly", (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
    );
  } catch {
    return null;
  }
};

// → true on success, false on any failure (quota, private mode, …).
export const putStoredState = async (state) => {
  if (!idbSupported()) return false;
  try {
    await tx("readwrite", (store) =>
      new Promise((resolve, reject) => {
        const req = store.put({ state, savedAt: Date.now() }, KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const dropStoredState = async () => {
  if (!idbSupported()) return false;
  try {
    await tx("readwrite", (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      })
    );
    return true;
  } catch {
    return false;
  }
};
