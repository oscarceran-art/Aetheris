import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useActions, useDirectory, useSettings } from "../lib/store";
import { listModels } from "../lib/openai";
import { AgentAvatar } from "./AgentAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

// First-run wizard: key → agent → first chat. Shown on Home until onboarded.
export const OnboardingDialog = () => {
  const settings = useSettings();
  const { agents } = useDirectory();
  const { setSettings, createConversation } = useActions();
  const nav = useNavigate();
  const [step, setStep] = useState(settings.apiKey ? 1 : 0);
  const [key, setKey] = useState(settings.apiKey || "");
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.id);
  if (settings.onboarded) return null;

  const done = (to) => {
    setSettings({ onboarded: true });
    if (to) nav(to);
  };
  const verify = async () => {
    const k = key.replace(/\s+/g, "");
    if (!k) return toast.error("Paste a key first");
    setBusy(true);
    try {
      const available = await listModels(k);
      setSettings({ apiKey: k, models: available.length ? available : settings.models });
      toast.success("Key verified");
      setStep(1);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };
  const start = () => {
    const agent = agents.find((a) => a.id === agentId) || agents[0];
    if (!agent) return done(null);
    const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    toast.success(`Say hello to ${agent.name}`);
    done(`/agent/${agent.id}/chat/${c.id}`);
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="glass-menu rounded-3xl border-0 sm:max-w-lg" data-testid="onboarding-dialog" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="py-2 font-display text-xl text-fg">
            {step === 0 ? "Welcome to Aetheris." : step === 1 ? "Pick your first planet." : "You're set."}
          </DialogTitle>
        </DialogHeader>

        {step === 0 && (
          <>
            <p className="mb-4 text-sm leading-relaxed text-dim">
              Aetheris talks straight from your device to OpenAI — paste an API key to begin. It stays in this browser only, never in backups or files.
            </p>
            <div className="field flex items-center rounded-2xl pr-2">
              <KeyRound className="ml-3 h-4 w-4 shrink-0 text-dim" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verify()}
                placeholder="sk-proj-…"
                data-testid="onboarding-key-input"
                className="flex-1 bg-transparent px-3 py-2.5 font-mono text-sm outline-none"
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => done(null)} className="text-xs text-dim hover:text-fg" data-testid="onboarding-skip-button">Skip for now</button>
              <button onClick={verify} disabled={busy} className="btn-solid btn-accent" data-testid="onboarding-verify-button">
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & continue
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="mb-4 text-sm text-dim">Each agent is a specialist with its own persona. You can add more later in Agent studio.</p>
            <div className="mb-4 grid gap-2">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAgentId(a.id)}
                  data-testid={`onboarding-agent-${a.id}`}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${a.id === agentId ? "border-transparent bg-[color:var(--hover)]" : "border-[color:var(--line)] hover:bg-[color:var(--hover)]"}`}
                >
                  <AgentAvatar agent={a} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{a.name} · {a.role}</span>
                    <span className="block truncate text-xs text-dim">{a.persona}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(2)} disabled={!agentId} className="btn-solid btn-accent disabled:opacity-50" data-testid="onboarding-pick-button">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-4 space-y-2 text-sm leading-relaxed text-dim">
              <p><span className="font-mono text-fg">/</span> throws a gem — a one-reply instruction like <span className="font-mono text-fg">/idea</span> or <span className="font-mono text-fg">/short</span>.</p>
              <p>The <span className="text-fg">paperclip</span> attaches documents, the <span className="text-fg">globe</span> toggles live web search.</p>
              <p><span className="font-mono text-fg">⌘K</span> searches every chat. Your data stays on this device.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={start} className="btn-solid btn-accent" data-testid="onboarding-start-button">
                Start chatting <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
