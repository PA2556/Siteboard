// Constants, date helpers, filtering and placement rules shared by the UI modules.

export const STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "needs_review", label: "Needs review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

export const PRIORITIES = [
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" },
  { id: "low", label: "Low" },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.label]));

export const CATEGORIES = [
  { id: "content", label: "Content update" },
  { id: "broken_link", label: "Broken link" },
  { id: "accessibility", label: "Accessibility" },
  { id: "design", label: "Design/layout" },
  { id: "navigation", label: "Navigation" },
  { id: "forms", label: "Forms" },
  { id: "other", label: "Other" },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const FIELD_LABEL = {
  title: "Title",
  description: "Description",
  assignees: "Assignees",
  priority: "Priority",
  dueDate: "Due date",
  pageUrl: "Page or section",
  category: "Category",
  blockerNotes: "Blocker notes",
};

// ---- Dates (due dates are plain YYYY-MM-DD strings in the viewer's local calendar) ----

export function todayStr(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function dayNumber(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function daysUntil(due, today = todayStr()) {
  return dayNumber(due) - dayNumber(today);
}

export function formatDate(s, today = todayStr()) {
  const [y, m, d] = s.split("-").map(Number);
  const sameYear = y === Number(today.slice(0, 4));
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** { label, short, overdue, soon } for a task's due date, or null. */
export function dueInfo(task, today = todayStr()) {
  if (!task.dueDate) return null;
  const n = daysUntil(task.dueDate, today);
  const date = formatDate(task.dueDate, today);
  if (task.status === "done") return { label: date, short: date, overdue: false, soon: false };
  if (n < 0) {
    return { label: `${date}, ${-n} ${-n === 1 ? "day" : "days"} overdue`, short: `Overdue · ${date}`, overdue: true, soon: false };
  }
  if (n === 0) return { label: "Due today", short: "Due today", overdue: false, soon: true };
  if (n === 1) return { label: "Due tomorrow", short: "Due tomorrow", overdue: false, soon: true };
  return { label: `Due ${date}`, short: `Due ${date}`, overdue: false, soon: n <= 7 };
}

export function formatDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---- People & links ----

export const firstName = (name) => name.trim().split(/\s+/)[0] || name;

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Returns an http(s) URL if the text looks like a web address, otherwise null. */
export function asLink(text) {
  const t = (text || "").trim();
  if (!t || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export const sameValue = (a, b) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null);

// ---- Filters ----

export const NO_FILTERS = { q: "", assignee: "all", priority: "all", status: "all", category: "all", due: "all" };

export const activeFilterCount = (f) => Object.keys(NO_FILTERS).filter((k) => f[k] !== NO_FILTERS[k]).length;

export function matches(t, f, today = todayStr()) {
  if (f.assignee === "unassigned" ? t.assignees.length > 0 : f.assignee !== "all" && !t.assignees.includes(f.assignee)) return false;
  if (f.priority !== "all" && t.priority !== f.priority) return false;
  if (f.status !== "all" && t.status !== f.status) return false;
  if (f.category !== "all" && t.category !== f.category) return false;
  if (f.due !== "all") {
    if (f.due === "none") {
      if (t.dueDate) return false;
    } else {
      if (!t.dueDate) return false;
      const n = daysUntil(t.dueDate, today);
      const open = t.status !== "done";
      if (f.due === "overdue" && !(open && n < 0)) return false;
      if (f.due === "today" && n !== 0) return false;
      if (f.due === "week" && !(n >= 0 && n <= 7)) return false;
    }
  }
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [t.title, t.description, t.pageUrl, t.blockerNotes, CATEGORY_LABEL[t.category], ...t.subtasks.map((s) => s.title)]
      .join("\n")
      .toLowerCase();
    if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

// ---- Board placement (mirrors the server so moves can show instantly) ----

const GAP = 1024;

export function positionIn(tasks, status, movingId, beforeId) {
  const col = tasks.filter((t) => t.status === status && !t.archived && t._id !== movingId).sort((a, b) => a.position - b.position);
  if (beforeId) {
    const i = col.findIndex((t) => t._id === beforeId);
    if (i >= 0) {
      const next = col[i].position;
      const prev = i > 0 ? col[i - 1].position : next - 2 * GAP;
      return (prev + next) / 2;
    }
  }
  return col.length ? col[col.length - 1].position + GAP : GAP;
}
