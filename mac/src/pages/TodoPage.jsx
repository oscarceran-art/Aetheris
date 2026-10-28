import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Trash2, X } from "lucide-react";
import { useStore } from "../lib/store";
import { PageHeader } from "../components/PageHeader";
import { uid } from "../lib/defaults";
import { dateFromKey, formatDateKey, localDateKey } from "../lib/dates";
import "../HomeTodo.css";

const PRIORITIES = [
  { id: "low", label: "Low", color: "#94a3b8" },
  { id: "med", label: "Medium", color: "#f59e0b" },
  { id: "high", label: "High", color: "#fb7185" },
];

const newItem = (due = "") => ({
  id: uid(),
  title: "",
  done: false,
  priority: "med",
  due,
  notes: "",
  createdAt: Date.now(),
});

const TaskForm = ({ item, onChange, onSave, onCancel, titleTestid, prefix, saveLabel }) => (
  <div className="glass-card rounded-3xl p-5 sm:p-6" data-testid={`${prefix}-form`}>
    <input
      autoFocus
      value={item.title}
      onChange={(e) => onChange({ ...item, title: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave();
        if (e.key === "Escape") onCancel();
      }}
      placeholder="What needs doing?"
      className="field w-full rounded-2xl px-4 py-3 text-base"
      data-testid={titleTestid}
    />
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.18em] text-dim">Priority</span>
        <select
          value={item.priority}
          onChange={(e) => onChange({ ...item, priority: e.target.value })}
          className="field w-full rounded-xl px-3 py-2.5 text-sm"
          data-testid={`${prefix}-priority`}
        >
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.18em] text-dim">Due date</span>
        <input
          type="date"
          value={item.due || ""}
          onChange={(e) => onChange({ ...item, due: e.target.value })}
          className="field w-full rounded-xl px-3 py-2.5 text-sm"
          data-testid={`${prefix}-due`}
        />
      </label>
    </div>
    <textarea
      value={item.notes || ""}
      onChange={(e) => onChange({ ...item, notes: e.target.value })}
      placeholder="Notes (optional)"
      rows={2}
      className="field mt-3 w-full resize-y rounded-xl px-3 py-2.5 text-sm"
      data-testid={`${prefix}-notes`}
    />
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button onClick={onCancel} className="btn-ghost" data-testid={`${prefix}-cancel`}><X className="h-4 w-4" /> Cancel</button>
      <button onClick={onSave} disabled={!item.title.trim()} className="btn-solid btn-accent disabled:opacity-40" data-testid={`${prefix}-save`}><Check className="h-4 w-4" /> {saveLabel}</button>
    </div>
  </div>
);

const monthGrid = (month) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
};

export default function TodoPage() {
  const { state, setSettings } = useStore();
  const todos = state.settings.todos || [];
  const today = localDateKey();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState("day");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const update = (next) => setSettings({ todos: next });

  const stats = useMemo(() => ({
    open: todos.filter((t) => !t.done).length,
    today: todos.filter((t) => !t.done && t.due === today).length,
    overdue: todos.filter((t) => !t.done && t.due && t.due < today).length,
    done: todos.filter((t) => t.done).length,
  }), [todos, today]);

  const monthTasks = useMemo(() => {
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
    return todos.filter((t) => t.due?.startsWith(prefix));
  }, [todos, month]);

  const taskByDate = useMemo(() => {
    const map = new Map();
    for (const task of todos) {
      if (!task.due) continue;
      map.set(task.due, [...(map.get(task.due) || []), task]);
    }
    return map;
  }, [todos]);

  const days = useMemo(() => monthGrid(month), [month]);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  const selectedLabel = formatDateKey(selectedDate, { weekday: "long", month: "long", day: "numeric" });

  const visibleTasks = useMemo(() => todos
    .filter((t) => view === "all" || t.due === selectedDate)
    .filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      if (filter === "overdue") return !t.done && t.due && t.due < today;
      return true;
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999") ||
      (PRIORITIES.findIndex((p) => p.id === b.priority) - PRIORITIES.findIndex((p) => p.id === a.priority)) || (b.createdAt || 0) - (a.createdAt || 0)),
  [todos, view, selectedDate, filter, today]);

  const add = () => setDraft(newItem(view === "day" ? selectedDate : ""));
  const saveDraft = () => {
    if (!draft?.title?.trim()) return;
    update([{ ...draft, title: draft.title.trim() }, ...todos]);
    setDraft(null);
  };
  const saveEdit = () => {
    if (!editing?.title?.trim()) return;
    update(todos.map((t) => (t.id === editing.id ? { ...t, ...editing, title: editing.title.trim() } : t)));
    setEditing(null);
  };
  const toggle = (id) => update(todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t)));
  const remove = (id) => update(todos.filter((t) => t.id !== id));
  const selectDate = (date) => {
    setSelectedDate(date);
    const parsed = dateFromKey(date);
    if (parsed) setMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setView("day");
  };
  const changeMonth = (direction) => {
    const next = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    setMonth(next);
    setSelectedDate(localDateKey(next));
    setView("day");
  };
  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(today);
    setView("day");
    setFilter("all");
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="todo-page">
      <PageHeader eyebrow="Your planner" title="Tasks & calendar">
        <button data-click onClick={add} className="btn-solid btn-accent" data-testid="todo-add"><Plus className="h-4 w-4" /> Add task</button>
      </PageHeader>
      <div className="mx-auto max-w-7xl space-y-6 px-5 pb-16 sm:px-8 lg:px-12">
        <p className="-mt-3 max-w-2xl text-sm leading-relaxed text-dim">A calm place to see what’s coming up, capture a task, and keep your week moving.</p>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Task overview">
          {[
            { id: "active", label: "Open tasks", value: stats.open, tint: "text-accent" },
            { id: "today", label: "Due today", value: stats.today, tint: "text-sky-400" },
            { id: "overdue", label: "Overdue", value: stats.overdue, tint: "text-rose-400" },
            { id: "done", label: "Completed", value: stats.done, tint: "text-emerald-400" },
          ].map((stat) => (
            <button
              key={stat.id}
              onClick={() => {
                if (stat.id === "today") {
                  selectDate(today);
                  setFilter("all");
                } else {
                  setView("all");
                  setFilter(stat.id);
                }
              }}
              className="glass-card rounded-2xl px-4 py-3 text-left transition-transform hover:-translate-y-0.5 sm:px-5 sm:py-4"
              data-testid={`todo-stat-${stat.id}`}
            >
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-dim sm:text-[10px]">{stat.label}</span>
              <span className={`mt-1 block font-display text-2xl font-semibold ${stat.tint}`}>{stat.value}</span>
            </button>
          ))}
        </section>

        {draft && <TaskForm item={draft} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} titleTestid="todo-draft-title" prefix="todo-draft" saveLabel="Add task" />}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
          <section className="glass-card min-w-0 rounded-[28px] p-4 sm:p-6" data-testid="todo-calendar">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">Monthly view</div>
                <h2 className="todo-month-title mt-1 font-display text-xl font-semibold text-fg sm:text-2xl">{monthLabel}</h2>
                <p className="mt-1 text-xs text-dim">{monthTasks.length} scheduled {monthTasks.length === 1 ? "task" : "tasks"}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={goToday} className="btn-ghost px-3 py-2 text-xs" data-testid="calendar-today">Today</button>
                <button onClick={() => changeMonth(-1)} className="btn-icon h-9 w-9 text-dim hover:text-fg" title="Previous month" aria-label="Previous month" data-testid="calendar-prev"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => changeMonth(1)} className="btn-icon h-9 w-9 text-dim hover:text-fg" title="Next month" aria-label="Next month" data-testid="calendar-next"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="todo-calendar-weekdays mb-2 text-center font-mono text-[9px] uppercase tracking-wider text-dim sm:text-[10px]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} className="py-2">{day}</span>)}
            </div>
            <div className="todo-calendar-grid" role="grid" aria-label={monthLabel}>
              {days.map((date) => {
                const key = localDateKey(date);
                const scheduled = taskByDate.get(key) || [];
                const openCount = scheduled.filter((t) => !t.done).length;
                const inMonth = date.getMonth() === month.getMonth();
                const isToday = key === today;
                const selected = key === selectedDate;
                return (
                  <button
                    key={key}
                    onClick={() => selectDate(key)}
                    className={`todo-calendar-day ${inMonth ? "" : "is-outside"} ${isToday ? "is-today" : ""} ${selected ? "is-selected" : ""}`}
                    aria-label={`${formatDateKey(key, { weekday: "long", month: "long", day: "numeric" })}, ${scheduled.length} ${scheduled.length === 1 ? "task" : "tasks"}`}
                    aria-pressed={selected}
                    data-testid={`calendar-day-${key}`}
                  >
                    <span className="todo-calendar-number">{date.getDate()}</span>
                    {scheduled.length > 0 && (
                      <span className={`todo-calendar-count ${openCount ? "has-open" : "all-done"}`}>
                        {openCount || <Check className="h-2.5 w-2.5" />}
                        {openCount ? <span>{openCount}</span> : null}
                      </span>
                    )}
                    {scheduled.length > 0 && <span className="todo-calendar-dots" aria-hidden>{scheduled.slice(0, 3).map((t) => <i key={t.id} className={t.done ? "is-done" : `priority-${t.priority || "med"}`} />)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--line)] pt-4 text-[10px] text-dim">
              <span className="flex items-center gap-1.5"><i className="todo-legend-dot priority-high" /> High priority</span>
              <span className="flex items-center gap-1.5"><i className="todo-legend-dot priority-med" /> Medium</span>
              <span className="flex items-center gap-1.5"><i className="todo-legend-dot priority-low" /> Low</span>
              <span className="ml-auto flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Today</span>
            </div>
          </section>

          <section className="glass-card min-w-0 rounded-[28px] p-4 sm:p-6" data-testid="todo-agenda">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">{view === "all" ? "Your tasks" : "Day agenda"}</div>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg">{view === "all" ? "All dates" : selectedLabel}</h2>
                <p className="mt-1 text-xs text-dim">{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</p>
              </div>
              <button data-click onClick={add} className="btn-icon h-9 w-9 shrink-0 text-accent" title="Add a task" aria-label="Add a task" data-testid="agenda-add"><Plus className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="glass-pill inline-flex rounded-full p-1">
                {[{ id: "day", label: "Selected day" }, { id: "all", label: "All dates" }].map((option) => (
                  <button key={option.id} onClick={() => setView(option.id)} className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${view === option.id ? "btn-accent" : "text-dim hover:text-fg"}`} data-testid={`todo-view-${option.id}`}>{option.label}</button>
                ))}
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="field max-w-32 rounded-xl px-2.5 py-2 text-[11px]" aria-label="Filter tasks" data-testid="todo-filter-select">
                <option value="all">All status</option>
                <option value="active">Open</option>
                <option value="done">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div className="mt-4 space-y-2">
              {visibleTasks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-10 text-center" data-testid="todo-empty">
                  <CalendarDays className="mx-auto h-6 w-6 text-dim" />
                  <p className="mt-3 text-sm text-fg">{view === "day" ? "Nothing planned for this day." : filter === "done" ? "Nothing completed yet." : "No tasks match this view."}</p>
                  <p className="mt-1 text-xs text-dim">Add a task here or choose another date on the calendar.</p>
                  <button onClick={add} className="btn-ghost mt-3 text-xs" data-testid="todo-empty-add"><Plus className="h-3.5 w-3.5" /> Add task</button>
                </div>
              )}
              {visibleTasks.map((task, i) => {
                const priority = PRIORITIES.find((p) => p.id === task.priority) || PRIORITIES[1];
                const overdue = task.due && task.due < today && !task.done;
                if (editing?.id === task.id) {
                  return <TaskForm key={task.id} item={editing} onChange={setEditing} onSave={saveEdit} onCancel={() => setEditing(null)} titleTestid={`todo-edit-${task.id}`} prefix={`todo-edit-${task.id}`} saveLabel="Save changes" />;
                }
                return (
                  <article key={task.id} className="todo-task-row rise" style={{ animationDelay: `${i * 25}ms` }} data-testid={`todo-item-${task.id}`}>
                    <button
                      onClick={() => toggle(task.id)}
                      className={`todo-task-check ${task.done ? "is-done" : ""}`}
                      aria-label={task.done ? `Mark ${task.title} as open` : `Complete ${task.title}`}
                      data-testid={`todo-toggle-${task.id}`}
                    >
                      {task.done && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${task.done ? "text-dim line-through" : "text-fg"}`} data-testid={`todo-title-${task.id}`}>{task.title}</p>
                      {task.notes && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dim">{task.notes}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="todo-priority" style={{ "--priority-color": priority.color }}><i />{priority.label}</span>
                        <span className={`flex items-center gap-1 text-[10px] ${overdue ? "text-rose-400" : "text-dim"}`}>
                          <Clock3 className="h-3 w-3" /> {task.due ? (overdue ? `Overdue · ${formatDateKey(task.due)}` : formatDateKey(task.due)) : "No due date"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button onClick={() => setEditing({ ...task })} className="btn-icon h-8 w-8 text-dim hover:text-fg" title="Edit task" aria-label={`Edit ${task.title}`} data-testid={`todo-edit-open-${task.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(task.id)} className="btn-icon h-8 w-8 text-dim hover:text-rose-400" title="Delete task" aria-label={`Delete ${task.title}`} data-testid={`todo-remove-${task.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
