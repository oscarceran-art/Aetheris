// Chats live in localStorage by default, which the browser can clear at any
// time. This module mirrors the whole app state into a real file on disk using
// the File System Access API, so the data survives cache clearing, a new
// browser profile, or a reinstall.
//
// The file handle is kept in IndexedDB (handles survive reloads; the *write
// permission* does not always, so we re-ask with a button click when needed).

const DB = "aetheris";
const STORE = "handles";
const KEY = "device-file";

export const deviceSaveSupported = () =>
  typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

const idb = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

export const getStoredHandle = async () => {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
};

const put = (value, del = false) => async () => {
  const db = await idb();
  return await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (del) store.delete(KEY);
    else store.put(value, KEY);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
};

export const putStoredHandle = (handle) => put(handle)().catch(() => false);
export const dropStoredHandle = () => put(null, true)().catch(() => false);

export const permissionState = async (handle) => {
  if (!handle?.queryPermission) return "granted";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
};

// Must be called from a click handler — the browser only shows the prompt in
// response to a real user gesture.
export const askPermission = async (handle) => {
  if (!handle?.requestPermission) return "granted";
  try {
    return await handle.requestPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
};

// Also gesture-bound. Returns null when the user cancels the dialog.
export const pickDeviceFile = async () => {
  try {
    return await window.showSaveFilePicker({
      suggestedName: "aetheris-data.json",
      types: [{ description: "Aetheris data", accept: { "application/json": [".json"] } }],
    });
  } catch (e) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
};

// Keys are deliberately left out of the file — it may end up in a synced or
// backed-up folder. They stay in localStorage / .env on this machine only.
export const sanitize = (state) => {
  const { settings, ...rest } = state;
  return { ...rest, settings: { ...settings, apiKey: "", anytype: { ...settings.anytype, apiKey: "" } } };
};

export const writeState = async (handle, state) => {
  const w = await handle.createWritable();
  await w.write(JSON.stringify(sanitize(state), null, 2));
  await w.close();
};

export const readState = async (handle) => {
  const file = await handle.getFile();
  return JSON.parse(await file.text());
};
