import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_AGENTS, DEFAULT_GEMS, DEFAULT_MODELS, DEFAULT_TEMPLATES, uid } from "./defaults";
import { configureSound } from "./sound";
import * as disk from "./persist";

const KEY = "aetheris.v1";
const Ctx = createContext(null);

// Optional Anytype key from .env (VITE_ANYTYPE_API_KEY) — same treatment as the
// OpenAI key: a default for a fresh install, never hardcoded.
const ENV_ANYTYPE_KEY = import.meta.env?.VITE_ANYTYPE_API_KEY || "";

const defaults = () => ({
  agents: DEFAULT_AGENTS.map((a) => ({ ...a, templates: DEFAULT_TEMPLATES[a.id] || [] })),
  conversations: [],
  gems: DEFAULT_GEMS,
  settings: { apiKey: import.meta.env?.VITE_OPENAI_API_KEY || "", theme: "dark", models: DEFAULT_MODELS, sidebar: "open", chatPanel: true, focus: false, lastChat: {}, wps: 10, instant: false, sound: { muted: false, volume: 0.4 }, web: { enabled: true }, anytype: { enabled: !!ENV_ANYTYPE_KEY, apiKey: ENV_ANYTYPE_KEY, spaceId: "", spaceName: "", write: true, base: "/anytype" } },
});

// Only these two models are offered, so anything saved by an older version (or
// imported from a backup) is pulled back onto one of them — otherwise an agent
// would hold a model that no longer exists in the picker or the API.
const useModel = (m) => (DEFAULT_MODELS.includes(m) ? m : DEFAULT_MODELS[0]);

const migrate = (s) => {
  const d = defaults();
  return {
    agents: (s.agents || d.agents).map((a) => ({
      ...a,
      model: useModel(a.model),
      templates: a.templates ?? DEFAULT_TEMPLATES[a.id] ?? [],
    })),
    conversations: (s.conversations || []).filter((c) => c.type === "chat"),
    gems: s.gems || d.gems,
    settings: {
      ...d.settings,
      ...s.settings,
      models: DEFAULT_MODELS,
      focus: false, // focus mode is gone — the ⛶ button is plain browser full screen now
      sound: { ...d.settings.sound, ...s.settings?.sound },
      web: { ...d.settings.web, ...s.settings?.web },
      anytype: { ...d.settings.anytype, ...s.settings?.anytype },
    },
  };
};

const load = () => {
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
  const [state, setState] = useState(load);

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

  // Persist at most once when updates settle, on idle time. During streaming the
  // debounce keeps resetting, so we never JSON.stringify the whole state mid-stream.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(stateRef.current));
      } catch {}
      const h = handleRef.current;
      if (h && mirrorOn.current) {
        disk
          .writeState(h, stateRef.current)
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
    const apply = () => document.documentElement.classList.toggle("dark", state.settings.theme === "dark");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!firstTheme.current && document.startViewTransition && !reduce) document.startViewTransition(apply);
    else apply();
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
      reset: () => setState(defaults()),
    }),
    []
  );

  return createElement(Ctx.Provider, { value: { state, device, ...api } }, children);
}

export const useStore = () => useContext(Ctx);
