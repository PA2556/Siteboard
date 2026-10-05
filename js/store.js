// Local data store. Everything is saved in this browser's localStorage on this device. There is no server:
// nothing is shared between devices or browsers, so use Backup (export/import) to move or keep a copy.
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, positionIn } from "./model.js";

const KEY = "siteboard.local.v1";
const GAP_DATE = /^\d{4}-\d{2}-\d{2}$/;

const emptyState = () => ({ v: 1, boardName: "", people: [], meId: null, tasks: [], comments: [], activity: [] });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return { ...emptyState(), ...s };
    }
  } catch {
    /* unreadable or blocked: start empty */
  }
  return emptyState();
}

let state = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(state));

export const getState = () => state;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Keep two tabs of the same browser in step.
window.addEventListener("storage", (e) => {
  if (e.key === KEY || e.key === null) {
    state = load();
    emit();
  }
});

/** Save first, then publish. If the browser refuses to save, nothing changes and the caller sees an error. */
function commit(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error("This browser couldn't save your changes. Its storage may be full or blocked (private windows often block it).");
  }
  state = next;
  emit();
}

export function storageWorks() {
  try {
    localStorage.setItem("siteboard.probe", "1");
    localStorage.removeItem("siteboard.probe");
    return true;
  } catch {
    return false;
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const nameOf = (s, id) => s.people.find((p) => p.id === id)?.name ?? "Someone";

function requireTask(s, id) {
  const t = s.tasks.find((x) => x._id === id);
  if (!t) throw new Error("This task no longer exists.");
  return t;
}
function log(s, taskId, message) {
  s.activity.push({ _id: uid(), taskId, actorId: s.meId, message, _creationTime: Date.now() });
}
function checkDate(d) {
  if (d == null || d === "") return undefined;
  if (!GAP_DATE.test(d) || Number.isNaN(Date.parse(d))) throw new Error("Enter a valid due date.");
  return d;
}
function checkAssignees(s, ids) {
  const allowed = new Set(s.people.map((p) => p.id));
  const unique = [...new Set(ids)];
  if (unique.some((id) => !allowed.has(id))) throw new Error("Tasks can only be assigned to people on this board.");
  return unique;
}

// ---------- Setup and people ----------

export function setup({ name, otherName, boardName }) {
  const me = clean(name, 80);
  if (!me) throw new Error("Enter your name.");
  const people = [{ id: uid(), name: me }];
  const other = clean(otherName, 80);
  if (other) people.push({ id: uid(), name: other });
  commit({ ...emptyState(), boardName: clean(boardName, 80), people, meId: people[0].id });
}

export function switchUser(id) {
  if (!state.people.some((p) => p.id === id)) return;
  commit({ ...state, meId: id });
}

export function renamePerson(id, name) {
  const n = clean(name, 80);
  if (!n) throw new Error("A name can't be empty.");
  commit({ ...state, people: state.people.map((p) => (p.id === id ? { ...p, name: n } : p)) });
}

export function addPerson(name) {
  const n = clean(name, 80);
  if (!n) throw new Error("Enter a name.");
  if (state.people.length >= 2) throw new Error("This board is for two people.");
  commit({ ...state, people: [...state.people, { id: uid(), name: n }] });
}

export function removePerson(id) {
  if (state.people.length <= 1) throw new Error("The board needs at least one person.");
  const people = state.people.filter((p) => p.id !== id);
  commit({
    ...state,
    people,
    meId: state.meId === id ? people[0].id : state.meId,
    tasks: state.tasks.map((t) => ({ ...t, assignees: t.assignees.filter((a) => a !== id) })),
  });
}

export function renameBoard(name) {
  commit({ ...state, boardName: clean(name, 80) });
}

// ---------- Backup ----------

export const exportJson = () => JSON.stringify(state, null, 2);

export function importJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Site Board backup.");
  }
  const ok = data && data.v === 1 && Array.isArray(data.people) && data.people.length && Array.isArray(data.tasks) && Array.isArray(data.comments) && Array.isArray(data.activity);
  if (!ok) throw new Error("That file isn't a Site Board backup.");
  commit({ ...emptyState(), ...data, meId: data.people.some((p) => p.id === data.meId) ? data.meId : data.people[0].id });
}

export function eraseAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = emptyState();
  emit();
}

// ---------- Tasks (same behaviour the shared version enforced on its server) ----------

export const commentsFor = (id) => state.comments.filter((c) => c.taskId === id);
export const activityFor = (id) => state.activity.filter((a) => a.taskId === id);

export const actions = {
  async create(a) {
    const s = structuredClone(state);
    const title = clean(a.title, 200);
    if (!title) throw new Error("Give the task a title.");
    const t = {
      _id: uid(),
      _creationTime: Date.now(),
      title,
      description: clean(a.description, 5000),
      assignees: checkAssignees(s, a.assignees || []),
      status: a.status,
      prevStatus: a.status === "done" ? "todo" : undefined,
      priority: a.priority,
      dueDate: checkDate(a.dueDate),
      pageUrl: clean(a.pageUrl, 500),
      category: a.category,
      subtasks: [],
      blockerNotes: clean(a.blockerNotes, 2000),
      archived: false,
      position: positionIn(s.tasks, a.status, null),
      createdBy: s.meId,
      updatedBy: s.meId,
    };
    s.tasks.push(t);
    log(s, t._id, `created this task in ${STATUS_LABEL[a.status]}`);
    commit(s);
    return t._id;
  },

  /** Field-level edit. Nothing can conflict on a single device, so this always succeeds. */
  async update({ id, patch }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    const same = (a, b) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null);
    for (const [key, incoming] of Object.entries(patch)) {
      if (incoming === undefined || same(task[key] ?? null, incoming)) continue;
      switch (key) {
        case "title": {
          const t = clean(incoming, 200);
          if (!t) throw new Error("Give the task a title.");
          log(s, id, `renamed the task from "${task.title}" to "${t}"`);
          task.title = t;
          break;
        }
        case "description":
          task.description = clean(incoming, 5000);
          log(s, id, "edited the description");
          break;
        case "assignees": {
          task.assignees = checkAssignees(s, incoming);
          const names = task.assignees.map((p) => nameOf(s, p));
          log(s, id, names.length ? `assigned the task to ${names.join(" and ")}` : "removed all assignees");
          break;
        }
        case "priority":
          log(s, id, `changed priority from ${PRIORITY_LABEL[task.priority]} to ${PRIORITY_LABEL[incoming]}`);
          task.priority = incoming;
          break;
        case "dueDate": {
          const d = checkDate(incoming);
          task.dueDate = d;
          log(s, id, d ? `set the due date to ${d}` : "removed the due date");
          break;
        }
        case "pageUrl":
          task.pageUrl = clean(incoming, 500);
          log(s, id, "updated the page or section");
          break;
        case "category":
          task.category = incoming;
          log(s, id, `changed category to ${CATEGORY_LABEL[incoming]}`);
          break;
        case "blockerNotes":
          task.blockerNotes = clean(incoming, 2000);
          log(s, id, "updated the blocker notes");
          break;
      }
    }
    task.updatedBy = s.meId;
    commit(s);
    return { ok: true, conflicts: [] };
  },

  async move({ id, status, beforeId }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    if (beforeId === id) return;
    const position = positionIn(s.tasks, status, id, beforeId);
    if (status === task.status) {
      task.position = position;
    } else {
      log(s, id, `moved the task from ${STATUS_LABEL[task.status]} to ${STATUS_LABEL[status]}`);
      task.prevStatus = status === "done" ? task.status : undefined; // remembered so unchecking can restore it
      task.status = status;
      task.position = position;
    }
    task.updatedBy = s.meId;
    commit(s);
  },

  async setCompleted({ id, completed }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    if (completed) {
      if (task.status === "done") return;
      task.position = positionIn(s.tasks, "done", id);
      task.prevStatus = task.status;
      task.status = "done";
      log(s, id, "marked the task complete");
    } else {
      if (task.status !== "done") return;
      const restore = task.prevStatus && task.prevStatus !== "done" ? task.prevStatus : "todo";
      task.position = positionIn(s.tasks, restore, id);
      task.status = restore;
      task.prevStatus = undefined;
      log(s, id, `reopened the task and restored it to ${STATUS_LABEL[restore]}`);
    }
    task.updatedBy = s.meId;
    commit(s);
  },

  async setArchived({ id, archived }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    if (task.archived === archived) return;
    if (!archived) task.position = positionIn(s.tasks, task.status, id);
    task.archived = archived;
    task.updatedBy = s.meId;
    log(s, id, archived ? "archived the task" : "restored the task from the archive");
    commit(s);
  },

  async remove({ id }) {
    const s = structuredClone(state);
    requireTask(s, id);
    s.tasks = s.tasks.filter((t) => t._id !== id);
    s.comments = s.comments.filter((c) => c.taskId !== id);
    s.activity = s.activity.filter((a) => a.taskId !== id);
    commit(s);
  },

  async addSubtask({ id, title }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    const t = clean(title, 200);
    if (!t) throw new Error("Enter a subtask.");
    if (task.subtasks.length >= 50) throw new Error("A task can have up to 50 subtasks.");
    task.subtasks.push({ id: uid(), title: t, done: false });
    task.updatedBy = s.meId;
    log(s, id, `added subtask "${t}"`);
    commit(s);
  },

  async toggleSubtask({ id, subtaskId, done }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    const sub = task.subtasks.find((x) => x.id === subtaskId);
    if (!sub || sub.done === done) return;
    sub.done = done;
    task.updatedBy = s.meId;
    log(s, id, `${done ? "checked off" : "reopened"} subtask "${sub.title}"`);
    commit(s);
  },

  async removeSubtask({ id, subtaskId }) {
    const s = structuredClone(state);
    const task = requireTask(s, id);
    const sub = task.subtasks.find((x) => x.id === subtaskId);
    if (!sub) return;
    task.subtasks = task.subtasks.filter((x) => x.id !== subtaskId);
    task.updatedBy = s.meId;
    log(s, id, `removed subtask "${sub.title}"`);
    commit(s);
  },

  async addComment({ id, body }) {
    const s = structuredClone(state);
    requireTask(s, id);
    const text = clean(body, 2000);
    if (!text) throw new Error("Write a comment first.");
    s.comments.push({ _id: uid(), taskId: id, authorId: s.meId, body: text, _creationTime: Date.now() });
    log(s, id, "added a comment");
    commit(s);
  },
};
