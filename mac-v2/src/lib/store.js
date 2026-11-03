import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_AGENTS, DEFAULT_GEMS, DEFAULT_MODELS, DEFAULT_TEMPLATES, uid } from "./defaults";
import { configureSound } from "./sound";
import * as disk from "./persist";
import * as idb from "./idb";

const KEY = "aetheris.v2";

// Split contexts: v1 kept everything in one context, so every streamed token
// re-rendered the entire app (sidebar, settings, …). Consumers below subscribe
// only to the slice they need — streaming updates conversations, not settings.
const SettingsCtx = createContext(null);
const DirectoryCtx = createContext(null); // agents + gems
const ConvosCtx = createContext(null); // conversations
const DeviceCtx = createContext(null);
const StorageCtx = createContext(null);
const ApiCtx = createContext(null);

// Optional Anytype key from .env (VITE_ANYTYPE_API_KEY) — same treatment as the
// OpenAI key: a default for a fresh install, never hardcoded.
const ENV_ANYTYPE_KEY = import.meta.env?.VITE_ANYTYPE_API_KEY || "";

const defaults = () => ({
  agents: DEFAULT_AGENTS.map((a) => ({ ...a, templates: DEFAULT_TEMPLATES[a.id] || [] })),
  conversations: [],
  gems: DEFAULT_GEMS,
  settings: { apiKey: import.meta.env?.VITE_OPENAI_API_KEY || "", theme: "dark", models: DEFAULT_MODELS, customModels: [], onboarded: false, sidebar: "open", chatPanel: true, focus: false, lastChat: {}, wps: 10, instant: false, sound: { muted: false, volume: 0.4 }, context: { mode: "messages", maxMessages: 40, maxTokens: 16000, overflow: "summarize" }, web: { enabled: true }, anytype: { enabled: !!ENV_ANYTYPE_KEY, apiKey: ENV_ANYTYPE_KEY, spaceId: "", spaceName: "", spaceExplicit: false, write: true, base: "/anytype" } },
});

// v1 force-reset every agent onto one of two hardcoded models. v2 keeps
// whatever the workspace already uses — unknown ids still work (cost.js falls
// back to default rates) and the picker offers them back (lib/models.js).
const keepModel = (m) => (typeof m === "string" && m.trim() ? m : DEFAULT_MODELS[0]);

export const migrate = (s) => {
  const d = defaults();
  const src = s && typeof s === "object" ? s : {};
  return {
    agents: (src.agents || d.agents).map((a) => ({
      ...a,
      model: keepModel(a.model),
      templates: a.templates ?? DEFAULT_TEMPLATES[a.id] ?? [],
    })),
    conversations: (src.conversations || []).filter((c) => c.type === "chat"),
    gems: src.gems || d.gems,
    settings: {
      ...d.settings,
      ...src.settings,
      models: Array.isArray(src.settings?.models) && src.settings.models.length ? [...new Set(src.settings.models)] : DEFAULT_MODELS,
      customModels: Array.isArray(src.settings?.customModels) ? [...new Set(src.settings.customModels)] : [],
      focus: false, // focus mode is gone — the ⛶ button is plain browser full screen now
      sound: { ...d.settings.sound, ...src.settings?.sound },
      context: { ...d.settings.context, ...src.settings?.context },
      web: { ...d.settings.web, ...src.settings?.web },
      anytype: {
        ...d.settings.anytype,
        ...src.settings?.anytype,
        ...(!src.settings?.anytype?.spaceExplicit ? { spaceId: "", spaceName: "", spaceExplicit: false } : {}),
      },
    },
  };
};

// Fast-boot cache: localStorage mirrors the last state so first paint is instant.
// IndexedDB (authoritative) loads right after and wins when it disagrees.
const loadCache = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s ? migrate(s) : defaults();
  } catch {
    return defaults();
  }
};

const apply = (obj, patch) => ({ ...obj, ...(typeof patch === "function" ? patch(obj) : patch) });
const mapIn = (s, key, id, patch) => ({ ...s, [key]: s[key].map((x) => (x.id === id ? apply(x, patch) : x)) });
const upsert = (list, item) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadCache);
  // storage: which backend holds the data + any persistence failure to surface.
  const [storage, setStorage] = useState({ backend: idb.idbSupported() ? "indexeddb" : "localstorage", ready: false, error: "" });

  // --- Optional mirror to a real file on disk ----------------------------
  // status: "off" | "on" | "needs-permission" | "error"
  const [device, setDevice] = useState({ supported: disk.deviceSaveSupported(), name: "", status: "off", at: 0 });
  const handleRef = useRef(null);
  const mirrorOn = useRef(false);

  // Re-attach the remembered file on startup. Writing resumes silently if the
  // browser still remembers the grant; otherwise the Settings card offers a
  // one-click reconnect (the prompt needs a user gesture).
  useEffect(() => {
    let alive = true;
    (async () => {
      const h = await disk.getStoredHandle();
      if (!alive || !h) return;
      const p = await disk.permissionState(h);
      if (!alive) return;
      handleRef.current = h;
      mirrorOn.current = p === "granted";
      setDevice((d) => ({ ...d, name: h.name, status: p === "granted" ? "on" : "needs-permission" }));
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Authoritative load from IndexedDB (async, right after first paint).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!idb.idbSupported()) {
        if (alive) setStorage((s) => ({ ...s, backend: "localstorage", ready: true }));
        return;
      }
      const rec = await idb.getStoredState();
      if (!alive) return;
      if (rec?.state) setState(migrate(rec.state));
      setStorage((s) => ({ ...s, backend: "indexeddb", ready: true }));
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist at most once when updates settle, on idle time. During streaming the
  // debounce keeps resetting, so we never serialize the whole state mid-stream.
  // IndexedDB is primary; localStorage stays as a fast-boot mirror; failures are
  // surfaced (v1 swallowed them) via storage.error + a toast.
  const stateRef = useRef(state);
  stateRef.current = state;
  const storageToastAt = useRef(0);
  const storageFail = (msg) => {
    setStorage((s) => ({ ...s, error: msg }));
    const now = Date.now();
    if (now - storageToastAt.current > 30_000) {
      storageToastAt.current = now;
      toast.error(msg);
    }
  };
  useEffect(() => {
    const save = () => {
      const snap = stateRef.current;
      idb.putStoredState(snap).then((ok) => {
        if (!ok && idb.idbSupported()) storageFail("Couldn't save to IndexedDB — your chats may not survive a restart. Export a backup from Settings.");
        else if (ok) setStorage((s) => (s.error ? { ...s, error: "" } : s));
      });
      try {
        localStorage.setItem(KEY, JSON.stringify(snap));
      } catch {
        storageFail("Browser storage is full — IndexedDB is primary, but the fast-boot cache couldn't be written. Export a backup from Settings.");
      }
      const h = handleRef.current;
      if (h && mirrorOn.current) {
        disk
          .writeState(h, snap)
          .then(() => setDevice((d) => ({ ...d, name: h.name, status: "on", at: Date.now() })))
          .catch(() => {
            mirrorOn.current = false;
            setDevice((d) => ({ ...d, status: "needs-permission" }));
          });
      }
    };
    const t = setTimeout(() => {
      if (window.requestIdleCallback) window.requestIdleCallback(save, { timeout: 2000 });
      else save();
    }, 500);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", save);
    };
  }, [state]);

  const firstTheme = useRef(true);
  useEffect(() => {
    const applyTheme = () => document.documentElement.classList.toggle("dark", state.settings.theme === "dark");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!firstTheme.current && document.startViewTransition && !reduce) document.startViewTransition(applyTheme);
    else applyTheme();
    firstTheme.current = false;
  }, [state.settings.theme]);

  useEffect(() => {
    configureSound(state.settings.sound);
  }, [state.settings.sound]);

  const api = useMemo(
    () => ({
      setSettings: (p) => setState((s) => ({ ...s, settings: { ...s.settings, ...p } })),
      upsertAgent: (a) => setState((s) => ({ ...s, agents: upsert(s.agents, a) })),
      deleteAgent: (id) =>
        setState((s) => ({
          ...s,
          agents: s.agents.filter((a) => a.id !== id),
          gems: s.gems.filter((g) => g.agentId !== id),
          conversations: s.conversations.filter((c) => c.agentId !== id),
        })),
      upsertGem: (g) => setState((s) => ({ ...s, gems: upsert(s.gems, g) })),
      deleteGem: (id) => setState((s) => ({ ...s, gems: s.gems.filter((g) => g.id !== id) })),
      createConversation: (c) => {
        const conv = { id: uid(), messages: [], createdAt: Date.now(), updatedAt: Date.now(), ...c };
        setState((s) => ({ ...s, conversations: [conv, ...s.conversations] }));
        return conv;
      },
      restoreConversation: (c) => setState((s) => ({ ...s, conversations: [c, ...s.conversations.filter((x) => x.id !== c.id)] })),
      patchConversation: (id, patch) => setState((s) => mapIn(s, "conversations", id, patch)),
      deleteConversation: (id) => setState((s) => ({ ...s, conversations: s.conversations.filter((c) => c.id !== id) })),
      addMessage: (convId, msg) => {
        const m = { id: uid(), createdAt: Date.now(), ...msg };
        setState((s) =>
          mapIn(s, "conversations", convId, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, m] }))
        );
        return m.id;
      },
      updateMessage: (convId, msgId, patch) =>
        setState((s) =>
          mapIn(s, "conversations", convId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === msgId ? apply(m, patch) : m)),
          }))
        ),
      // --- Device file (File System Access API) ---
      // Every one of these must be called from a click handler, because the
      // browser only shows the save/permission dialog for a user gesture.
      connectDevice: async () => {
        const h = await disk.pickDeviceFile();
        if (!h) return false;
        const p = await disk.askPermission(h);
        await disk.putStoredHandle(h);
        handleRef.current = h;
        mirrorOn.current = p === "granted";
        await disk.writeState(h, stateRef.current);
        setDevice((d) => ({ ...d, name: h.name, status: "on", at: Date.now() }));
        return true;
      },
      reconnectDevice: async () => {
        const h = handleRef.current;
        if (!h) return false;
        const p = await disk.askPermission(h);
        if (p !== "granted") return false;
        mirrorOn.current = true;
        await disk.writeState(h, stateRef.current);
        setDevice((d) => ({ ...d, name: h.name, status: "on", at: Date.now() }));
        return true;
      },
      saveDeviceNow: async () => {
        const h = handleRef.current;
        if (!h) return false;
        await disk.writeState(h, stateRef.current);
        setDevice((d) => ({ ...d, name: h.name, status: "on", at: Date.now() }));
        return true;
      },
      loadDevice: async () => {
        const h = handleRef.current;
        if (!h) return false;
        const p = await disk.askPermission(h);
        if (p !== "granted") return false;
        const data = await disk.readState(h);
        setState((s) => {
          const merged = migrate(data);
          // Keys are never written to the file — keep the ones on this machine.
          return {
            ...merged,
            settings: { ...merged.settings, apiKey: s.settings.apiKey, anytype: { ...merged.settings.anytype, apiKey: s.settings.anytype.apiKey } },
          };
        });
        mirrorOn.current = true;
        setDevice((d) => ({ ...d, name: h.name, status: "on", at: Date.now() }));
        return true;
      },
      disconnectDevice: async () => {
        handleRef.current = null;
        mirrorOn.current = false;
        await disk.dropStoredHandle();
        setDevice((d) => ({ ...d, name: "", status: "off", at: 0 }));
      },
      replaceAll: (data) => setState(migrate(data)),
      reset: () => {
        idb.dropStoredState();
        try {
          localStorage.removeItem(KEY);
        } catch {}
        setState(defaults());
      },
    }),
    []
  );

  const directory = useMemo(() => ({ agents: state.agents, gems: state.gems }), [state.agents, state.gems]);

  return createElement(
    SettingsCtx.Provider,
    { value: state.settings },
    createElement(
      DirectoryCtx.Provider,
      { value: directory },
      createElement(
        ConvosCtx.Provider,
        { value: state.conversations },
        createElement(
          DeviceCtx.Provider,
          { value: device },
          createElement(
            StorageCtx.Provider,
            { value: storage },
            createElement(ApiCtx.Provider, { value: api }, children)
          )
        )
      )
    )
  );
}

// Selective subscriptions — prefer these over useStore in hot components.
export const useSettings = () => useContext(SettingsCtx);
export const useDirectory = () => useContext(DirectoryCtx);
export const useConversations = () => useContext(ConvosCtx);
export const useDevice = () => useContext(DeviceCtx);
export const useStorage = () => useContext(StorageCtx);
export const useActions = () => useContext(ApiCtx);

// Back-compat: same shape as v1 ({ state, device, ...api }). Re-renders on any
// slice change — fine for pages, avoid in per-message components.
export const useStore = () => {
  const settings = useContext(SettingsCtx);
  const directory = useContext(DirectoryCtx);
  const conversations = useContext(ConvosCtx);
  const device = useContext(DeviceCtx);
  const storage = useContext(StorageCtx);
  const api = useContext(ApiCtx);
  return useMemo(
    () => ({ state: { settings, agents: directory.agents, gems: directory.gems, conversations }, device, storage, ...api }),
    [settings, directory, conversations, device, storage, api]
  );
};
