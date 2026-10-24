import { useMemo, useState } from "react";
import { Plus, Trash2, Check, Calendar, Clock, X } from "lucide-react";
import { useStore } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { uid } from "../lib/defaults";

const PRIORITIES = [
  { id: "low", label: "Low", color: "#9ca3af" },
  { id: "med", label: "Medium", color: "#f59e0b" },
  { id: "high", label: "High", color: "#f87171" },
];

const newItem = () => ({
  id: uid(),
  title: "",
  done: false,
  priority: "med",
  due: "",
  notes: "",
  createdAt: Date.now(),
});

export default function TodoPage() {
  const { state, setSettings } = useStore();
  const todos = state.settings.todos || [];
  const [filter, setFilter] = useState("all"); // all | active | done | today
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);

  const update = (next) => setSettings({ todos: next });

  const add = () => setDraft(newItem());
  const saveDraft = () => {
    if (!draft?.title?.trim()) return;
    update([{ ...draft, title: draft.title.trim() }, ...todos]);
    setDraft(null);
  };
  const cancelDraft = () => setDraft(null);

  const toggle = (id) => {
    update(todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t)));
  };
  const remove = (id) => update(todos.filter((t) => t.id !== id));
  const saveEdit = () => {
    if (!editing?.title?.trim()) return;
    update(todos.map((t) => (t.id === editing.id ? { ...t, title: editing.title.trim() } : t)));
    setEditing(null);
  };

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "active") return todos.filter((t) => !t.done);
    if (filter === "done") return todos.filter((t) => t.done);
    if (filter === "today") return todos.filter((t) => !t.done && t.due === today);
    return todos;
  }, [todos, filter, today]);

  const counts = useMemo(
    () => ({
      all: todos.length,
      active: todos.filter((t) => !t.done).length,
      done: todos.filter((t) => t.done).length,
      today: todos.filter((t) => !t.done && t.due === today).length,
    }),
    [todos, today]
  );

  const pColor = (p) => PRIORITIES.find((x) => x.id === p)?.color || "#9ca3af";

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="todo-page">
      <PageHeader eyebrow="To-do" title="Tasks & calendar">
        <button onClick={add} className="btn-solid btn-accent" data-testid="todo-add"><Plus className="h-4 w-4" /> Add task</button>
      </PageHeader>
      <div className="space-y-8 px-6 pb-20 sm:px-10 lg:px-14">
        <p className="-mt-1 max-w-2xl text-base text-dim">Track tasks with priorities and due dates. Everything stays in this browser.</p>

        <div className="flex flex-wrap gap-3">
          {[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
            { id: "today", label: "Today" },
            { id: "done", label: "Done" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${filter === f.id ? "bg-[color:var(--hover)] text-fg" : "text-dim hover:text-fg"}`}
              data-testid={`todo-filter-${f.id}`}
            >
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>

        {draft && (
          <div className="glass-card rounded-3xl p-6" data-testid="todo-draft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDraft();
                  if (e.key === "Escape") cancelDraft();
                }}
                placeholder="What needs doing?"
                className="field flex-1 px-5 py-3 text-base"
                data-testid="todo-draft-title"
              />
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                  className="field px-4 py-2.5 text-sm"
                  data-testid="todo-draft-priority"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                  className="field px-4 py-2.5 text-sm"
                  data-testid="todo-draft-due"
                />
                <button onClick={saveDraft} className="btn-solid btn-accent" data-testid="todo-draft-save">
                  <Check className="h-4 w-4" /> Add
                </button>
                <button onClick={cancelDraft} className="btn-ghost" data-testid="todo-draft-cancel">
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-dim" data-testid="todo-empty">
              {filter === "done" ? "Nothing completed yet." : filter === "today" ? "Nothing due today." : "No tasks yet — add one above."}
            </div>
          )}
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className="glass-card rise flex items-center gap-4 rounded-2xl px-6 py-4"
              style={{ animationDelay: `${i * 30}ms` }}
              data-testid={`todo-item-${t.id}`}
            >
              <button
                onClick={() => toggle(t.id)}
                className={`grid h-7 w-7 place-items-center rounded-full border transition-colors ${t.done ? "border-emerald-400 bg-emerald-400/20 text-emerald-400" : "border-[color:var(--line)] text-transparent"}`}
                data-testid={`todo-toggle-${t.id}`}
              >
                <Check className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                {editing?.id === t.id ? (
                  <input
                    autoFocus
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="field w-full px-4 py-2 text-base"
                    data-testid={`todo-edit-${t.id}`}
                  />
                ) : (
                  <button
                    onClick={() => setEditing({ ...t })}
                    className={`block w-full truncate text-left text-base ${t.done ? "text-dim line-through" : "text-fg"}`}
                    title="Click to edit"
                    data-testid={`todo-title-${t.id}`}
                  >
                    {t.title}
                  </button>
                )}
              </div>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: pColor(t.priority) }} title={PRIORITIES.find((p) => p.id === t.priority)?.label} />
              {t.due && (
                <span className={`flex items-center gap-1.5 text-sm ${t.due < today && !t.done ? "text-amber-400" : "text-dim"}`} title="Due date">
                  <Calendar className="h-4 w-4" />
                  {t.due}
                </span>
              )}
              <button onClick={() => remove(t.id)} className="btn-icon h-9 w-9 text-dim hover:text-red-400" data-testid={`todo-remove-${t.id}`} title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
