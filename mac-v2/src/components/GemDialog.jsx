import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "../lib/store";
import { GEM_COLORS, uid } from "../lib/defaults";
import { TRIGGER_RE } from "../lib/gems";
import { GemShape } from "./Gem";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const Label = ({ children }) => <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{children}</div>;

export const newGem = (agentId = null) => ({ id: uid(), trigger: "", instruction: "", color: GEM_COLORS[Math.floor(Math.random() * GEM_COLORS.length)], agentId });

export const GemDialog = ({ gem, onClose, lockScope = false, extraAgents = [] }) => {
  const { state, upsertGem } = useStore();
  const [g, setG] = useState(gem);
  const set = (p) => setG((x) => ({ ...x, ...p }));
  const agents = [...state.agents, ...extraAgents.filter((a) => !state.agents.some((x) => x.id === a.id))];
  const save = () => {
    const trigger = g.trigger.trim().toLowerCase();
    if (!TRIGGER_RE.test(trigger)) return toast.error("Trigger: letters, numbers and dashes only");
    if (!g.instruction.trim()) return toast.error("Add an instruction");
    if (state.gems.some((x) => x.id !== g.id && x.trigger === trigger && (x.agentId || null) === (g.agentId || null)))
      return toast.error(`/${trigger} already exists here`);
    upsertGem({ ...g, trigger, instruction: g.instruction.trim() });
    toast.success(`/${trigger} saved`);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-menu max-h-[90vh] overflow-y-auto rounded-3xl border-0 sm:max-w-md" data-testid="gem-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-display text-fg">
            <GemShape color={g.color} size={26} /> {gem.trigger ? "Edit gem" : "New gem"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div>
            <Label>Trigger</Label>
            <div className="field flex items-center rounded-xl px-3">
              <span className="font-mono text-dim">/</span>
              <input value={g.trigger} onChange={(e) => set({ trigger: e.target.value.replace(/\s/g, "").toLowerCase() })} placeholder="idea" className="flex-1 bg-transparent py-2 pl-1 font-mono text-sm outline-none" data-testid="gem-trigger-input" />
            </div>
          </div>
          <div>
            <Label>Instruction</Label>
            <textarea rows={3} value={g.instruction} onChange={(e) => set({ instruction: e.target.value })} placeholder="What should the agent do differently when this gem is used?" className="field w-full resize-none rounded-xl px-3 py-2 text-sm" data-testid="gem-instruction-input" />
          </div>
          <div>
            <Label>Works with</Label>
            <Select value={g.agentId || "global"} onValueChange={(v) => set({ agentId: v === "global" ? null : v })} disabled={lockScope}>
              <SelectTrigger className="field rounded-xl text-sm" data-testid="gem-scope-select"><SelectValue /></SelectTrigger>
              <SelectContent className="glass-menu">
                <SelectItem value="global">All agents (global)</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>Only {a.name || "this agent"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              {GEM_COLORS.map((c) => (
                <button key={c} onClick={() => set({ color: c })} data-testid={`gem-color-${c.slice(1)}`} className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${g.color === c ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`} style={{ background: c, "--tw-ring-color": c }} />
              ))}
              <label className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full" style={{ background: "conic-gradient(#f43f5e,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef,#f43f5e)" }} title="Custom color">
                <input type="color" value={g.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" data-testid="gem-color-custom" />
              </label>
              <span className="font-mono text-xs text-dim">{g.color}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost" data-testid="gem-cancel-button">Cancel</button>
            <button onClick={save} className="btn-solid btn-accent" data-testid="gem-save-button">Save gem</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
