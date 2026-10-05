// The board: six columns of task cards, live updates without re-creating unchanged cards, and drag and drop.
import { STATUSES, STATUS_LABEL, CATEGORY_LABEL, dueInfo, todayStr } from "./model.js";
import { h, cx, icon, statusIcon, assignees, priorityMark, checkbox, menuButton, run } from "./dom.js";

const MOUSE_DRAG_DISTANCE = 6;
const TOUCH_HOLD_MS = 220;
const TOUCH_MOVE_TOLERANCE = 8;

export function createBoard({ actions, onOpen }) {
  const cards = new Map(); // task id -> { li, sig }
  const columns = new Map(); // status -> { section, ul, count, empty }
  let current = new Map(); // task id -> latest task
  let membersNow = [];
  let pending = null; // an update that arrived mid-drag
  let drag = null;

  const el = h("div", { class: "board", role: "list", "aria-label": "Task board" });
  for (const s of STATUSES) {
    const count = h("span", { class: "count" }, "0");
    const ul = h("ul", { class: "cards" });
    const empty = h("p", { class: "column-empty" });
    const body = h("div", { class: "column-body" }, ul, empty);
    const section = h(
      "section",
      { class: `column column-${s.id}`, role: "listitem", "aria-labelledby": `col-h-${s.id}`, "data-status": s.id },
      h("header", { class: "column-head" }, h("h2", { id: `col-h-${s.id}` }, statusIcon(s.id), s.label), count),
      body,
    );
    columns.set(s.id, { section, ul, count, empty, body });
    el.append(section);
  }

  const moveTo = (task, status, beforeId) => run(`Moving "${task.title}"`, () => actions.move({ id: task._id, status, beforeId }));

  // ---------- Cards ----------

  function buildCard(task) {
    const due = dueInfo(task);
    const done = task.status === "done";
    const subDone = task.subtasks.filter((s) => s.done).length;
    const blocker = task.status === "blocked" && task.blockerNotes ? task.blockerNotes : "";

    const menuItems = () => {
      const t = current.get(task._id) || task;
      return [
        ...STATUSES.map((s, i) => ({ label: s.label, checked: t.status === s.id, separatorBefore: i === 0, onSelect: () => moveTo(t, s.id) })),
        { label: "Archive task", separatorBefore: true, onSelect: () => run(`Archiving "${t.title}"`, () => actions.setArchived({ id: t._id, archived: true })) },
      ];
    };

    return h(
      "article",
      { class: cx("card", `prio-${task.priority}`, due?.overdue && "is-overdue", done && "is-done") },
      h(
        "div",
        { class: "card-top" },
        checkbox({
          checked: done,
          label: `${done ? "Mark not done" : "Mark done"}: ${task.title}`,
          onChange: (checked) => run(`Updating "${task.title}"`, () => actions.setCompleted({ id: task._id, completed: checked })),
        }),
        h("button", { type: "button", class: "card-title", onClick: () => onOpen(task._id) }, task.title),
        menuButton({ label: `Move or archive: ${task.title} (currently ${STATUS_LABEL[task.status]})`, items: menuItems, className: "btn btn-icon btn-ghost card-menu" }),
      ),
      h("p", { class: "card-category" }, h("span", { class: "tag" }, CATEGORY_LABEL[task.category])),
      blocker && h("p", { class: "card-blocker" }, blocker),
      h(
        "div",
        { class: "card-meta" },
        priorityMark(task.priority),
        due && h("span", { class: cx("due", due.overdue && "due-overdue", due.soon && "due-soon"), title: due.label }, icon(due.overdue ? "alert" : "calendar", 13), due.short),
        task.subtasks.length > 0 &&
          h(
            "span",
            { class: "subtasks", "aria-label": `${subDone} of ${task.subtasks.length} subtasks done` },
            icon("list", 13),
            `${subDone}/${task.subtasks.length}`,
            h("span", { class: "mini-bar", "aria-hidden": "true" }, h("span", { style: `width:${(subDone / task.subtasks.length) * 100}%` })),
          ),
      ),
      h("div", { class: "card-foot" }, assignees(task.assignees, membersNow)),
    );
  }

  function cardSignature(task) {
    return JSON.stringify([task.title, task.status, task.priority, task.category, task.dueDate, task.assignees, task.subtasks, task.blockerNotes, todayStr(), membersNow.map((m) => m.name)]);
  }

  function cardFor(task) {
    let entry = cards.get(task._id);
    if (!entry) {
      entry = { li: h("li", { class: "card-slot", "data-id": task._id }), sig: null };
      cards.set(task._id, entry);
    }
    const sig = cardSignature(task);
    if (entry.sig !== sig) {
      const hadFocus = entry.li.contains(document.activeElement);
      entry.li.replaceChildren(buildCard(task));
      entry.sig = sig;
      if (hadFocus) entry.li.querySelector(".card-title")?.focus();
    }
    return entry.li;
  }

  /** tasks: filtered, non-archived. */
  function update({ tasks, members, visibleStatuses, filtered }) {
    if (drag?.active) {
      pending = { tasks, members, visibleStatuses, filtered };
      return;
    }
    pending = null;
    membersNow = members;
    current = new Map(tasks.map((t) => [t._id, t]));

    const by = new Map(STATUSES.map((s) => [s.id, []]));
    for (const t of tasks) by.get(t.status)?.push(t);
    const used = new Set();

    for (const s of STATUSES) {
      const col = columns.get(s.id);
      col.section.hidden = !visibleStatuses.includes(s.id);
      const list = by.get(s.id).sort((a, b) => a.position - b.position);
      const wanted = list.map((t) => (used.add(t._id), cardFor(t)));
      for (const child of [...col.ul.children]) if (!wanted.includes(child)) child.remove();
      wanted.forEach((li, i) => {
        if (col.ul.children[i] !== li) col.ul.insertBefore(li, col.ul.children[i] || null);
      });
      col.count.textContent = String(list.length);
      col.count.setAttribute("aria-label", `${list.length} ${list.length === 1 ? "task" : "tasks"}`);
      col.empty.textContent = list.length ? "" : filtered ? "No matching tasks" : "Nothing here yet";
      col.empty.hidden = list.length > 0;
    }
    for (const id of [...cards.keys()]) if (!used.has(id)) cards.delete(id);
  }

  // ---------- Drag and drop ----------

  let scrollRaf = 0;
  const touchBlocker = (e) => e.cancelable && e.preventDefault();

  el.addEventListener("pointerdown", (e) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const slot = e.target.closest(".card-slot");
    if (!slot || e.target.closest(".check, .card-menu")) return;
    const task = current.get(slot.dataset.id);
    if (!task) return;
    drag = { task, slot, pointerId: e.pointerId, pointerType: e.pointerType, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null, ghost: null, timer: 0 };
    if (e.pointerType !== "mouse") drag.timer = window.setTimeout(() => begin(), TOUCH_HOLD_MS);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
  });

  function begin() {
    if (!drag || drag.active) return;
    clearTimeout(drag.timer);
    drag.active = true;
    const card = drag.slot.firstElementChild;
    const r = card.getBoundingClientRect();
    drag.offX = drag.x - r.left;
    drag.offY = drag.y - r.top;
    const ghost = card.cloneNode(true);
    ghost.classList.add("is-overlay");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = `position:fixed;left:0;top:0;width:${r.width}px;margin:0;pointer-events:none;z-index:90;`;
    document.body.append(ghost);
    drag.ghost = ghost;
    drag.slot.classList.add("is-dragging");
    document.body.classList.add("is-dragging-card");
    if (drag.pointerType !== "mouse") document.addEventListener("touchmove", touchBlocker, { passive: false });
    place();
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function place() {
    drag.ghost.style.transform = `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px) rotate(1.5deg)`;
    const under = document.elementFromPoint(drag.x, drag.y);
    clearHighlights();
    drag.target = null;
    const slotT = under?.closest(".card-slot");
    const colT = under?.closest(".column");
    if (slotT && slotT !== drag.slot && current.has(slotT.dataset.id)) {
      slotT.classList.add("is-target");
      drag.target = { type: "card", task: current.get(slotT.dataset.id) };
    } else if (colT) {
      colT.classList.add("is-over");
      drag.target = { type: "column", status: colT.dataset.status };
    }
  }

  function clearHighlights() {
    el.querySelectorAll(".is-target, .is-over").forEach((n) => n.classList.remove("is-target", "is-over"));
  }

  function autoScroll() {
    if (!drag?.active) return;
    const edge = 56;
    const b = el.getBoundingClientRect();
    if (drag.x < b.left + edge) el.scrollLeft -= 14;
    else if (drag.x > b.right - edge) el.scrollLeft += 14;
    const body = document.elementFromPoint(drag.x, drag.y)?.closest(".column")?.querySelector(".column-body");
    if (body) {
      const r = body.getBoundingClientRect();
      if (drag.y < r.top + edge) body.scrollTop -= 12;
      else if (drag.y > r.bottom - edge) body.scrollTop += 12;
    }
    place();
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
      if (drag.pointerType === "mouse" ? dist > MOUSE_DRAG_DISTANCE : dist > TOUCH_MOVE_TOLERANCE) {
        if (drag.pointerType === "mouse") begin();
        else cleanup(); // the finger is scrolling, not dragging
      }
      return;
    }
    place();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const wasActive = drag.active;
    const { task, target } = drag;
    if (wasActive) {
      suppressNextClick();
      cleanup();
      if (target) drop(task, target);
    } else cleanup();
  }

  function onCancel(e) {
    if (drag && e.pointerId === drag.pointerId) cleanup();
  }

  function onKey(e) {
    if (e.key === "Escape" && drag) cleanup();
  }

  function cleanup() {
    if (!drag) return;
    clearTimeout(drag.timer);
    cancelAnimationFrame(scrollRaf);
    drag.ghost?.remove();
    drag.slot.classList.remove("is-dragging");
    clearHighlights();
    document.body.classList.remove("is-dragging-card");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("touchmove", touchBlocker);
    drag = null;
    if (pending) update(pending);
  }

  function suppressNextClick() {
    const stop = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 50);
  }

  function drop(task, target) {
    if (target.type === "column") {
      const col = [...current.values()].filter((t) => t.status === target.status).sort((a, b) => a.position - b.position);
      if (target.status !== task.status || col.at(-1)?._id !== task._id) moveTo(task, target.status);
      return;
    }
    const over = target.task;
    if (over._id === task._id) return;
    const col = [...current.values()].filter((t) => t.status === over.status).sort((a, b) => a.position - b.position);
    let beforeId = over._id;
    if (over.status === task.status) {
      // Dragging down within a column should land after the card you drop on.
      const from = col.findIndex((t) => t._id === task._id);
      const to = col.findIndex((t) => t._id === over._id);
      if (from < to) beforeId = col[to + 1]?._id;
    }
    moveTo(task, over.status, beforeId);
  }

  return { el, update };
}
