import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { AgentAvatar } from "./AgentAvatar";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";

const snippet = (text, q) => {
  const i = text.toLowerCase().indexOf(q);
  return (i > 30 ? "…" : "") + text.slice(Math.max(0, i - 30), i + 70);
};

export const SearchPalette = ({ open, onOpenChange }) => {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const results = [...state.conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => {
      if (!ql || c.title.toLowerCase().includes(ql)) return { c, snip: null };
      const m = c.messages.find((x) => x.content?.toLowerCase().includes(ql));
      return m ? { c, snip: snippet(m.content, ql) } : null;
    })
    .filter(Boolean)
    .slice(0, 30);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-menu overflow-hidden rounded-3xl border-0 p-0 sm:max-w-xl" data-testid="search-palette">
        <DialogTitle className="sr-only">Search chats</DialogTitle>
        <Command shouldFilter={false} className="bg-transparent text-fg">
          <CommandInput value={q} onValueChange={setQ} placeholder="Search all chats…" data-testid="search-input" />
          <CommandList className="max-h-96 p-1.5">
            <CommandEmpty className="py-8 text-center text-sm text-dim">No chats found.</CommandEmpty>
            {results.map(({ c, snip }) => {
              const a = state.agents.find((x) => x.id === c.agentId);
              return (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    nav(`/agent/${c.agentId}/chat/${c.id}`);
                    onOpenChange(false);
                  }}
                  data-testid={`search-result-${c.id}`}
                  className="gap-3 rounded-xl px-3 py-2.5"
                >
                  <AgentAvatar agent={a} size={22} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-fg">{c.title}</div>
                    <div className="truncate text-xs text-dim">{snip || a?.name}</div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export const SHORTCUTS = [
  ["⌘/Ctrl K", "Search all chats"],
  ["⌘/Ctrl B", "Collapse / hide / show sidebar"],
  ["N  or  Alt N", "New chat with current agent"],
  ["/  or  I", "Focus the message box"],
  ["1 – 9", "Switch to agent 1–9"],
  ["F", "Toggle full screen"],
  ["?", "Show this sheet"],
];

export const ShortcutsDialog = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="glass-menu rounded-3xl border-0 sm:max-w-md" data-testid="shortcuts-dialog">
      <DialogTitle className="font-display text-fg">Keyboard shortcuts</DialogTitle>
      <div className="space-y-1 pt-2">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-[color:var(--hover)]">
            <span className="text-sm text-fg">{d}</span>
            <kbd className="rounded-lg border border-[color:var(--line)] bg-[color:var(--sunk)] px-2 py-0.5 font-mono text-xs text-dim">{k}</kbd>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
