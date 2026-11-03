import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useDirectory } from "../lib/store";
import { QUICK_HANDOFFS, buildHandoff } from "../lib/handoff";
import { AgentAvatar } from "./AgentAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export const HandoffDialog = ({ message, fromAgent, onClose, onConfirm }) => {
  const { agents } = useDirectory();
  const others = agents.filter((a) => a.id !== fromAgent?.id);
  const [targetId, setTargetId] = useState(others[0]?.id || fromAgent?.id);
  const [quick, setQuick] = useState(QUICK_HANDOFFS[0].id);
  const [custom, setCustom] = useState("");
  const instruction = custom.trim() || QUICK_HANDOFFS.find((q) => q.id === quick)?.instruction || "";
  const preview = useMemo(
    () => buildHandoff({ message, fromAgent, instruction }),
    [message, fromAgent, instruction]
  );
  const target = agents.find((a) => a.id === targetId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-menu max-h-[90vh] overflow-y-auto rounded-3xl border-0 sm:max-w-lg" data-testid="handoff-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 py-2 font-display text-fg">
            <Send className="h-4 w-4 text-accent" /> Send to another agent
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-1 mb-4 text-sm text-dim">
          Opens a new chat with {target?.name || "the agent"} — the quoted message plus your instruction become its first message.
        </p>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Agent</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setTargetId(a.id)}
              data-testid={`handoff-agent-${a.id}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${a.id === targetId ? "border-transparent btn-accent" : "border-[color:var(--line)] text-dim hover:text-fg"}`}
            >
              <AgentAvatar agent={a} size={20} /> {a.name}
            </button>
          ))}
        </div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Instruction</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_HANDOFFS.map((q) => (
            <button
              key={q.id}
              onClick={() => {
                setQuick(q.id);
                setCustom("");
              }}
              data-testid={`handoff-quick-${q.id}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${!custom && quick === q.id ? "border-transparent btn-accent" : "border-[color:var(--line)] text-dim hover:text-fg"}`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Or write your own instruction…"
          data-testid="handoff-custom-input"
          className="field mb-3 w-full rounded-xl px-3 py-2 text-sm"
        />
        <div className="mb-4 max-h-40 overflow-y-auto scroll-thin rounded-2xl border border-[color:var(--line)] p-3 text-xs leading-relaxed text-dim whitespace-pre-wrap" data-testid="handoff-preview">
          {preview}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" data-testid="handoff-cancel-button">Cancel</button>
          <button
            onClick={() => target && onConfirm(target, preview)}
            disabled={!target}
            className="btn-solid btn-accent disabled:opacity-50"
            data-testid="handoff-confirm-button"
          >
            <Send className="h-4 w-4" /> Send to {target?.name || "…"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
