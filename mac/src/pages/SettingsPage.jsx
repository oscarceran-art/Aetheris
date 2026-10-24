import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, RefreshCw, Download, Upload, Trash2, Moon, Sun, ShieldCheck, Gauge, Volume2, Notebook, HardDrive, Save, FolderInput, X, Globe, Plus, Plug, Pencil, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../lib/store";
import { listModels } from "../lib/openai";
import { listSpaces } from "../lib/anytype";
import { searchWeb } from "../lib/websearch";
import { mcpListServers, mcpSaveServers, mcpRestart } from "../lib/mcp";
import { sanitize as sanitizeState } from "../lib/persist";
import { DEFAULT_MODELS } from "../lib/defaults";
import { chime } from "../lib/sound";
import { PageHeader } from "../components/PageHeader";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-6 py-2">
    <span className="text-sm text-fg">{label}</span>
    {children}
  </div>
);

const MotionCard = () => {
  const { state, setSettings } = useStore();
  const { wps, instant, sound } = state.settings;
  return (
    <>
      <Card title="Reply speed" icon={Gauge} i={2}>
        <Row label="Instant (no word-by-word fade)">
          <Switch checked={instant} onCheckedChange={(v) => setSettings({ instant: v })} data-testid="instant-switch" />
        </Row>
        <Row label={`Fade-in pace · ${wps} words / sec`}>
          <Slider className="w-56" min={4} max={40} step={1} value={[wps]} disabled={instant} onValueChange={([v]) => setSettings({ wps: v })} data-testid="wps-slider" />
        </Row>
      </Card>
      <Card title="Sound" icon={Volume2} i={3}>
        <Row label="Mute all sounds">
          <Switch checked={sound.muted} onCheckedChange={(v) => setSettings({ sound: { ...sound, muted: v } })} data-testid="mute-switch" />
        </Row>
        <Row label={`Volume · ${Math.round(sound.volume * 100)}%`}>
          <Slider
            className="w-56"
            min={0}
            max={100}
            step={5}
            value={[Math.round(sound.volume * 100)]}
            disabled={sound.muted}
            onValueChange={([v]) => setSettings({ sound: { ...sound, volume: v / 100 } })}
            onValueCommit={() => chime("#22d3ee")}
            data-testid="volume-slider"
          />
        </Row>
      </Card>
    </>
  );
};

const Card = ({ title, icon: Icon, children, i = 0 }) => (
  <section className="glass-card rise rounded-3xl p-6" style={{ animationDelay: `${i * 60}ms` }}>
    <div className="mb-4 flex items-center gap-2 font-display font-semibold text-fg"><Icon className="h-4 w-4 text-accent" /> {title}</div>
    {children}
  </section>
);

const KeyCard = () => {
  const { state, setSettings } = useStore();
  const [key, setKey] = useState(state.settings.apiKey);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    const k = key.replace(/\s+/g, "");
    if (!k) return toast.error("Paste a key first");
    setBusy(true);
    try {
      const available = await listModels(k);
      setKey(k);
      setSettings({ apiKey: k });
      const missing = DEFAULT_MODELS.filter((m) => !available.includes(m));
      if (missing.length) toast.warning(`Key saved · this key can't see ${missing.join(", ")}`);
      else toast.success(`Key verified · ${available.length} models on the key, both app models available`);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };
  return (
    <Card title="OpenAI API key" icon={KeyRound}>
      <p className="mb-4 text-sm text-dim">Stored only in this browser's localStorage. Requests go straight from your device to OpenAI — there is no server in between.</p>
      <div className="flex gap-2">
        <div className="field flex flex-1 items-center rounded-2xl pr-2">
          <input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-proj-…"
            data-testid="api-key-input"
            className="flex-1 bg-transparent px-4 py-2.5 font-mono text-sm outline-none"
          />
          <button onClick={() => setShow(!show)} className="text-dim hover:text-fg" data-testid="api-key-toggle-visibility">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        <button onClick={verify} disabled={busy} className="btn-solid btn-accent" data-testid="api-key-save-button">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & save
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-dim" data-testid="api-key-status">
          <span className={`h-2 w-2 rounded-full ${state.settings.apiKey ? "bg-emerald-400" : "bg-amber-400"}`} />
          {state.settings.apiKey ? "Key configured" : "Missing key"} · {state.settings.models.join(" + ")}
        </span>
        {state.settings.apiKey && (
          <button onClick={() => { setSettings({ apiKey: "" }); setKey(""); toast("Key removed"); }} className="text-dim hover:text-red-400" data-testid="api-key-remove-button">Remove key</button>
        )}
      </div>
    </Card>
  );
};

const AnytypeCard = () => {
  const { state, setSettings } = useStore();
  const at = state.settings.anytype;
  const [key, setKey] = useState(at.apiKey);
  const [show, setShow] = useState(false);
  const [spaces, setSpaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const patch = (p) => setSettings({ anytype: { ...at, ...p } });
  const options = spaces.length ? spaces : at.spaceId ? [{ id: at.spaceId, name: at.spaceName || "Current space" }] : [];

  const connect = async () => {
    const k = key.trim();
    if (!k) return toast.error("Paste an Anytype API key first");
    setBusy(true);
    try {
      const list = await listSpaces({ ...at, apiKey: k });
      setSpaces(list);
      const keep = list.find((s) => s.id === at.spaceId) || list[0] || null;
      patch({ apiKey: k, enabled: true, spaceId: keep?.id || "", spaceName: keep?.name || "" });
      toast.success(list.length ? `Connected · ${list.length} space${list.length === 1 ? "" : "s"}` : "Connected — that account has no spaces yet");
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <Card title="Anytype" icon={Notebook} i={5}>
      <p className="mb-4 text-sm text-dim">
        Lets agents read and write your local Anytype vault. Anytype's API only listens on this machine, so requests are proxied by the dev server — keep the Anytype desktop app running and create a key in <span className="text-fg">Anytype → Settings → API Keys</span>.
      </p>
      <div className="flex gap-2">
        <div className="field flex flex-1 items-center rounded-2xl pr-2">
          <input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Anytype API key"
            data-testid="anytype-key-input"
            className="flex-1 bg-transparent px-4 py-2.5 font-mono text-sm outline-none"
          />
          <button onClick={() => setShow(!show)} className="text-dim hover:text-fg" data-testid="anytype-key-toggle-visibility">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        <button onClick={connect} disabled={busy} className="btn-solid btn-accent" data-testid="anytype-connect-button">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Notebook className="h-4 w-4" />} Connect
        </button>
      </div>

      {at.apiKey && (
        <div className="mt-4 space-y-1">
          <Row label="Agent access to Anytype">
            <Switch checked={at.enabled} onCheckedChange={(v) => patch({ enabled: v })} data-testid="anytype-enable-switch" />
          </Row>
          <Row label="Allow agents to create & edit objects">
            <Switch checked={at.write} onCheckedChange={(v) => patch({ write: v })} data-testid="anytype-write-switch" />
          </Row>
          <div className="flex items-center justify-between gap-6 py-2">
            <span className="text-sm text-fg">Default space <span className="text-dim">· agents can override</span></span>
            {options.length ? (
              <Select value={at.spaceId || options[0].id} onValueChange={(id) => { const s = options.find((x) => x.id === id); patch({ spaceId: id, spaceName: s?.name || "" }); }}>
                <SelectTrigger className="field w-56 rounded-xl text-xs" data-testid="anytype-space-select"><SelectValue /></SelectTrigger>
                <SelectContent className="glass-menu max-h-72">
                  {options.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-dim">Press Connect to load your spaces</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-dim" data-testid="anytype-status">
          <span className={`h-2 w-2 rounded-full ${at.enabled && at.apiKey && at.spaceId ? "bg-emerald-400" : at.apiKey ? "bg-amber-400" : "bg-slate-500"}`} />
          {!at.apiKey ? "Not connected" : at.enabled && at.spaceId ? `Connected · ${at.spaceName || "space selected"}${at.write ? " · read & write" : " · read only"}` : "Key saved — connect to pick a space"}
        </span>
        {at.apiKey && (
          <button onClick={() => { patch({ apiKey: "", spaceId: "", spaceName: "", enabled: false }); setKey(""); setSpaces([]); toast("Anytype disconnected"); }} className="text-dim hover:text-red-400" data-testid="anytype-remove-button">Disconnect</button>
        )}
      </div>
    </Card>
  );
};

const WebCard = () => {
  const { state, setSettings } = useStore();
  const web = state.settings.web || { enabled: false };
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    try {
      const results = await searchWeb({ enabled: true }, { query: "openai devday announcements", limit: 2 });
      if (results.length) toast.success(`Found ${results.length} · top result: ${results[0].title}`);
      else toast.warning("No results came back");
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <Card title="Web" icon={Globe} i={6}>
      <p className="mb-4 text-sm text-dim">
        Lets agents search the open web and read the pages they find, so answers can be current instead of stuck at their training date. The request runs through a small local endpoint on the dev server — no API key, and nothing is stored. Flip it on or off with the globe button in the chat composer.
      </p>
      <Row label="Allow agents to search the web">
        <Switch checked={!!web.enabled} onCheckedChange={(v) => setSettings({ web: { ...web, enabled: v } })} data-testid="web-enable-switch" />
      </Row>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-dim" data-testid="web-status">
          <span className={`h-2 w-2 rounded-full ${web.enabled ? "bg-emerald-400" : "bg-slate-500"}`} />
          {web.enabled ? "web_search + web_read available to every agent" : "Off — agents stay offline"}
        </span>
        <button onClick={test} disabled={busy} className="flex items-center gap-1.5 text-dim transition-colors hover:text-fg disabled:opacity-50" data-testid="web-test-button">
          {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />} Test a search
        </button>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

const splitArgs = (s) =>
  (String(s).match(/"[^"]*"|'[^']*'|\S+/g) || []).map((a) => a.replace(/^["']|["']$/g, ""));

const envToText = (env) =>
  env && typeof env === "object" ? Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") : String(env || "");

const envFromText = (text) => {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    if (i > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out[k] = line.slice(i + 1).trim();
  }
  return out;
};

const blankForm = { name: "", command: "", args: "", env: "", cwd: "" };

const stripLive = ({ name, command, args, env, cwd, enabled }) => ({ name, command, args, env, cwd, enabled });

const Field = ({ label, value, onChange, placeholder, testid, textarea }) => (
  <label className="block">
    <span className="mb-1 block text-xs text-dim">{label}</span>
    {textarea ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        data-testid={testid}
        className="field w-full rounded-2xl px-4 py-2.5 font-mono text-sm outline-none"
      />
    ) : (
      <div className="field flex items-center rounded-2xl">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testid}
          className="flex-1 bg-transparent px-4 py-2.5 font-mono text-sm outline-none"
        />
      </div>
    )}
  </label>
);

const McpCard = () => {
  const [servers, setServers] = useState(null); // null while loading
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(null);

  const load = async () => {
    try {
      setServers(await mcpListServers());
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
      setServers((s) => s || []);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await mcpListServers();
        if (alive) setServers(list);
      } catch (e) {
        if (alive) {
          setLoadError(e.message);
          setServers([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = async (next) => {
    setBusy(true);
    try {
      await mcpSaveServers(next.map(stripLive));
      setServers(await mcpListServers());
      setLoadError(null);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = form.name.trim();
    const command = form.command.trim();
    if (!name || !command) {
      toast.error("A server needs a name and a command to start it.");
      return;
    }
    const entry = {
      name,
      command,
      args: splitArgs(form.args),
      env: envFromText(form.env),
      cwd: form.cwd.trim(),
      enabled: true,
    };
    const next = [...(servers || []).filter((s) => s.name !== name).map(stripLive), entry];
    if (await persist(next)) {
      setForm(blankForm);
      setOpen(false);
      toast.success(`${name} added — its tools are available to every agent`);
    }
  };

  const toggle = async (s, v) => {
    await persist((servers || []).map((x) => ({ ...stripLive(x), enabled: x.name === s.name ? v : x.enabled })));
  };

  const remove = async (s) => {
    if (!window.confirm(`Remove the “${s.name}” MCP server?`)) return;
    await persist((servers || []).filter((x) => x.name !== s.name));
    toast(`${s.name} removed`);
  };

  const test = async (s) => {
    setTesting(s.name);
    try {
      const r = await mcpRestart(s.name);
      toast.success(`${s.name} · ${r.tools} tools`);
      await load();
    } catch (e) {
      toast.error(e.message);
      await load();
    } finally {
      setTesting(null);
    }
  };

  const loadIntoForm = (s) => {
    setForm({
      name: s.name,
      command: s.command,
      args: (s.args || []).map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(" "),
      env: envToText(s.env),
      cwd: s.cwd || "",
    });
    setOpen(true);
  };

  const totalTools = (servers || []).reduce((n, s) => n + (s.tools?.length || 0), 0);

  return (
    <Card title="MCP tools" icon={Puzzle} i={7}>
      <p className="mb-4 text-sm text-dim">
        MCP (Model Context Protocol) servers are small local programs that give every agent new tools — search files, query
        databases, talk to local services. A page can't start a process, so the dev server starts them on request. The config lives in <span className="font-mono text-xs text-fg">.mcp.json</span>{" "}
        next to the project — environment variables and API keys never touch this browser's storage or exported backups.
      </p>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 text-dim" data-testid="mcp-status">
          {servers === null && !loadError ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" /> Starting servers…
            </>
          ) : loadError ? (
            <span className="text-amber-400/90">{loadError}</span>
          ) : servers.length ? (
            <>
              <span className={`h-2 w-2 rounded-full ${totalTools ? "bg-emerald-400" : "bg-slate-500"}`} />
              {servers.length} server{servers.length > 1 ? "s" : ""} · {totalTools} tools ·{" "}
              {servers.filter((s) => s.enabled !== false).filter((s) => s.running).length} running
            </>
          ) : (
            "No MCP servers yet — add one below"
          )}
        </span>
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-dim transition-colors hover:text-fg" data-testid="mcp-add-button">
          <Plus className="h-3.5 w-3.5" /> {open ? "Close" : "Add a server"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[color:var(--line)] p-4" data-testid="mcp-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="my-server" testid="mcp-name-input" />
            <Field label="Command" value={form.command} onChange={(v) => setForm({ ...form, command: v })} placeholder="npx" testid="mcp-command-input" />
          </div>
          <Field
            label="Arguments (space-separated; quote anything with spaces)"
            value={form.args}
            onChange={(v) => setForm({ ...form, args: v })}
            placeholder="-y some-mcp-server"
            testid="mcp-args-input"
          />
          <Field
            label="Environment — one KEY=value per line (secret values stay in .mcp.json)"
            value={form.env}
            onChange={(v) => setForm({ ...form, env: v })}
            placeholder="MY_VAR=value"
            testid="mcp-env-input"
            textarea
          />
          <Field label="Working directory (optional — defaults to the project folder)" value={form.cwd} onChange={(v) => setForm({ ...form, cwd: v })} placeholder="~/Documents" testid="mcp-cwd-input" />
          <div className="flex gap-2">
            <button onClick={add} disabled={busy} className="btn-solid btn-accent disabled:opacity-50" data-testid="mcp-submit-button">
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add server
            </button>
            <button onClick={() => { setForm(blankForm); setOpen(false); }} className="btn-ghost" data-testid="mcp-cancel-button">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {(servers || []).map((s) => {
          const off = s.enabled === false;
          const err = !!s.error && !s.running;
          return (
            <div key={s.name} className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] px-3 py-2.5" data-testid={`mcp-row-${s.name}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${off ? "bg-slate-500" : err ? "bg-red-400" : s.running ? "bg-emerald-400" : "bg-amber-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-fg">{s.name}</span>
                  <span className="truncate font-mono text-xs text-dim">
                    {s.command} {(s.args || []).join(" ")}
                  </span>
                </div>
                <div className="truncate text-xs text-dim" data-testid={`mcp-state-${s.name}`}>
                  {off
                    ? "Off — its tools aren't sent to the model"
                    : err
                      ? s.error
                      : s.running
                        ? `${s.tools.length} tools ready`
                        : "Starting…"}
                </div>
                {err && s.stderr?.length > 0 && (
                  <div className="truncate font-mono text-[11px] text-red-400/80">{s.stderr.slice(-1)}</div>
                )}
              </div>
              <Switch checked={!off} onCheckedChange={(v) => toggle(s, v)} disabled={busy} data-testid={`mcp-toggle-${s.name}`} />
              <button
                onClick={() => test(s)}
                disabled={busy || testing === s.name}
                title="Stop it and start it fresh"
                className="p-1.5 text-dim transition-colors hover:text-fg disabled:opacity-50"
                data-testid={`mcp-test-${s.name}`}
              >
                {testing === s.name ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => loadIntoForm(s)}
                title="Edit in the form"
                className="p-1.5 text-dim transition-colors hover:text-fg"
                data-testid={`mcp-edit-${s.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(s)}
                title="Remove"
                className="p-1.5 text-dim transition-colors hover:text-red-400"
                data-testid={`mcp-remove-${s.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-dim">
        While a server is switched on, its tool definitions ride along on every message (a large server adds a few thousand
        tokens of context) — switch it off when you're not using it. Server startup and tool calls can take a few seconds the
        first time; the status line in chat shows what's running.
      </p>
    </Card>
  );
};

const DataCard = () => {
  const { state, device, connectDevice, reconnectDevice, saveDeviceNow, loadDevice, disconnectDevice, replaceAll, reset } = useStore();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r === false) toast.error("That didn't work — check the file is still available");
      else if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e?.message || "Could not write the file");
    }
    setBusy(false);
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(sanitizeState(state), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aetheris-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success("Backup exported (API key excluded)");
  };
  const importData = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      replaceAll({ ...data, settings: { ...data.settings, apiKey: state.settings.apiKey, anytype: { ...data.settings?.anytype, apiKey: state.settings.anytype.apiKey } } });
      toast.success("Backup imported");
    } catch {
      toast.error("Invalid backup file");
    }
    e.target.value = "";
  };

  const connected = device.status === "on";
  const status =
    device.status === "needs-permission"
      ? "Permission for the file expired — reconnect to keep saving."
      : device.status === "error"
        ? `Could not write ${device.name || "the file"}.`
        : connected
          ? `Mirroring to ${device.name}${device.at ? ` · last saved ${new Date(device.at).toLocaleTimeString()}` : ""}`
          : "Chats are only in this browser right now — clearing site data would erase them.";

  return (
    <Card title="Local data" icon={Download} i={4}>
      <p className="mb-4 text-sm text-dim">
        {state.agents.length} agents · {state.conversations.length} chats · {state.gems.length} gems.
      </p>

      <div className="rounded-2xl border border-[color:var(--line)] p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-fg">
          <HardDrive className="h-4 w-4 text-accent" /> Save chats on this device
        </div>
        <p className="mb-3 text-xs text-dim" data-testid="device-status">{status}</p>
        {device.supported ? (
          <div className="flex flex-wrap gap-2">
            {(device.status === "off" || device.status === "error") && (
              <button disabled={busy} onClick={() => run(connectDevice, "Saving to file")} className="btn-solid btn-accent" data-testid="device-save-button">
                <Save className="h-4 w-4" /> {device.status === "error" ? "Choose a file again" : "Save chats to a file…"}
              </button>
            )}
            {device.status === "needs-permission" && (
              <button disabled={busy} onClick={() => run(reconnectDevice, "Saving again")} className="btn-solid btn-accent" data-testid="device-reconnect-button">
                <RefreshCw className="h-4 w-4" /> Reconnect {device.name}
              </button>
            )}
            {connected && (
              <>
                <button disabled={busy} onClick={() => run(saveDeviceNow, "Saved")} className="btn-ghost" data-testid="device-save-now-button"><Save className="h-4 w-4" /> Save now</button>
                <button disabled={busy} onClick={() => run(loadDevice, "Loaded from file")} className="btn-ghost" data-testid="device-load-button"><FolderInput className="h-4 w-4" /> Load from file</button>
                <button disabled={busy} onClick={() => run(disconnectDevice, "Stopped saving to file")} className="btn-ghost" data-testid="device-stop-button"><X className="h-4 w-4" /> Stop</button>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-dim">This browser can't write files directly (Chrome, Edge and Opera can). Use <span className="text-fg">Export JSON</span> below to keep a backup.</p>
        )}
        <p className="mt-3 text-[11px] text-dim">Saving keeps the whole workspace in one JSON file you own. Your API keys are never written to it.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={exportData} className="btn-ghost" data-testid="export-data-button"><Download className="h-4 w-4" /> Export JSON</button>
        <button onClick={() => fileRef.current?.click()} className="btn-ghost" data-testid="import-data-button"><Upload className="h-4 w-4" /> Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} data-testid="import-data-input" />
        <button
          onClick={() => {
            if (window.confirm(`Erase all local agents, chats, gems and your key?${connected ? `\n\nThis also clears the copy saved to ${device.name}.` : ""}`)) {
              reset();
              toast("All local data cleared");
            }
          }}
          className="btn-ghost text-red-400"
          data-testid="reset-data-button"
        >
          <Trash2 className="h-4 w-4" /> Reset everything
        </button>
      </div>
    </Card>
  );
};

export default function SettingsPage() {
  const { state, setSettings } = useStore();
  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="settings-page">
      <PageHeader eyebrow="Settings" title="Local-first, by design." />
      <div className="mx-auto max-w-3xl space-y-4 px-6 pb-16 sm:px-10">
        <KeyCard />
        <AnytypeCard />
        <WebCard />
        <McpCard />
        <Card title="Appearance" icon={state.settings.theme === "dark" ? Moon : Sun} i={1}>
          <div className="glass-pill inline-flex rounded-full p-1">
            {["dark", "light"].map((t) => (
              <button key={t} onClick={() => setSettings({ theme: t })} data-testid={`theme-option-${t}`} className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm capitalize ${state.settings.theme === t ? "btn-accent" : "text-dim"}`}>
                {t === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />} {t}
              </button>
            ))}
          </div>
        </Card>
        <MotionCard />
        <DataCard />
      </div>
    </div>
  );
}
