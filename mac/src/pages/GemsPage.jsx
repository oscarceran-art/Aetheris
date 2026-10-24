import { useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { AgentAvatar } from "../components/AgentAvatar";
import { GemShape } from "../components/Gem";
import { GemDialog, newGem } from "../components/GemDialog";

const GemCard = ({ gem, i, onEdit }) => {
  const { deleteGem, upsertGem } = useStore();
  return (
    <div className="glass-card rise group flex items-start gap-4 rounded-3xl p-5" style={{ animationDelay: `${i * 40}ms`, "--glow": gem.color }} data-testid={`gem-card-${gem.id}`}>
      <div className="pt-1"><GemShape color={gem.color} size={26} /></div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-base font-medium" style={{ color: `color-mix(in srgb, ${gem.color} 75%, var(--fg))` }}>/{gem.trigger}</div>
        <p className="mt-1 text-sm leading-relaxed text-dim">{gem.instruction}</p>
      </div>
      <div className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <button onClick={() => upsertGem({ ...gem, fav: !gem.fav })} className={`btn-icon h-8 w-8 ${gem.fav ? "text-amber-400" : "text-dim hover:text-fg"}`} data-testid={`gem-fav-${gem.id}`} title="Favourite shelf"><Star className={`h-4 w-4 ${gem.fav ? "fill-current" : ""}`} /></button>
        <button onClick={onEdit} className="btn-icon h-8 w-8 text-dim hover:text-fg" data-testid={`gem-edit-${gem.id}`}><Pencil className="h-4 w-4" /></button>
        <button onClick={() => { deleteGem(gem.id); toast(`/${gem.trigger} deleted`); }} className="btn-icon h-8 w-8 text-dim hover:text-red-400" data-testid={`gem-delete-${gem.id}`}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

const Section = ({ title, icon, gems, onEdit, testid }) => (
  <section className="space-y-3" data-testid={testid}>
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{icon}{title} · {gems.length}</div>
    <div className="grid gap-3 lg:grid-cols-2">
      {gems.map((g, i) => <GemCard key={g.id} gem={g} i={i} onEdit={() => onEdit(g)} />)}
    </div>
  </section>
);

export default function GemsPage() {
  const { state } = useStore();
  const [editing, setEditing] = useState(null);
  const global = state.gems.filter((g) => !g.agentId);
  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="gems-page">
      <PageHeader eyebrow="Gems" title="Throw a gem, change the reply.">
        <button onClick={() => setEditing(newGem())} className="btn-solid btn-accent" data-testid="create-gem-button"><Plus className="h-4 w-4" /> New gem</button>
      </PageHeader>
      <div className="space-y-10 px-6 pb-16 sm:px-10">
        <p className="-mt-2 max-w-xl text-sm text-dim">
          Type a gem's trigger in any chat, like <span className="font-mono text-fg">/idea</span>. Global gems work with every agent; agent gems only work with their agent and win over a global gem with the same trigger.
        </p>
        <Section title="Global" gems={global} onEdit={setEditing} testid="gems-global" />
        {state.agents.map((a) => {
          const own = state.gems.filter((g) => g.agentId === a.id);
          if (!own.length) return null;
          return <Section key={a.id} title={`${a.name} only`} icon={<AgentAvatar agent={a} size={22} />} gems={own} onEdit={setEditing} testid={`gems-agent-${a.id}`} />;
        })}
      </div>
      {editing && <GemDialog gem={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
