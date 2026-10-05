// Task details panel (view, edit, create). Live updates refresh every field the person has not touched;
// fields they have changed stay as typed until saved, and the server reports a conflict if the other person
// changed the same field in the meantime.
import { CATEGORIES, FIELD_LABEL, PRIORITIES, STATUSES, STATUS_LABEL, asLink, dueInfo, formatDateTime, sameValue } from "./model.js";
import { h, cx, icon, checkbox, dialog, run, setValue } from "./dom.js";
import * as store from "./store.js";

const toEditable = (t) => ({
  title: t.title,
  description: t.description,
  assignees: t.assignees,
  priority: t.priority,
  dueDate: t.dueDate ?? null,
  pageUrl: t.pageUrl,
  category: t.category,
  blockerNotes: t.blockerNotes,
});

export function createPanel({ task: initialTask, newStatus: initialNewStatus, me, members: initialMembers, actions, onClose, onCreated }) {
  let task = initialTask; // null while creating
  let members = initialMembers;
  const isNew = task === null;
  const defaults = { title: "", description: "", assignees: [], priority: "normal", dueDate: null, pageUrl: "", category: "content", blockerNotes: "" };

  let draft = {};
  let base = {};
  let conflicts = [];
  let saving = false;
  let settling = false;
  let settleTimer = 0;
  let newStatus = initialNewStatus;
  let tab = "comments";
  let comments;
  let activity;
  const unsubs = [];

  const live = () => (task ? toEditable(task) : defaults);
  const val = (k) => (k in draft ? draft[k] : live()[k]);
  const isDirty = () => Object.keys(draft).length > 0;
  const status = () => (task ? task.status : newStatus);
  const other = () => members.find((m) => m.id !== me.id);
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? "Someone";

  // ---------- Build ----------

  const els = {};
  const titleInput = (els.title = h("input", { id: "f-title", class: "input-title", maxlength: "200", required: true }));
  const statusSel = (els.status = h("select", { id: "f-status" }, STATUSES.map((s) => h("option", { value: s.id }, s.label))));
  const prioritySel = (els.priority = h("select", { id: "f-priority" }, PRIORITIES.map((p) => h("option", { value: p.id }, p.label))));
  const dueInput = (els.dueDate = h("input", { id: "f-due", type: "date" }));
  const dueHint = h("p", { class: "hint", hidden: true });
  const categorySel = (els.category = h("select", { id: "f-cat" }, CATEGORIES.map((c) => h("option", { value: c.id }, c.label))));
  const chipsBox = h("div", { class: "row wrap" });
  const urlInput = (els.pageUrl = h("input", { id: "f-url", maxlength: "500", placeholder: "Page address, or the section name" }));
  const openLink = h("a", { class: "btn", target: "_blank", rel: "noopener noreferrer", hidden: true }, icon("link"), "Open page");
  const descInput = (els.description = h("textarea", { id: "f-desc", rows: "4", maxlength: "5000" }));
  const blockInput = (els.blockerNotes = h("textarea", { id: "f-block", rows: "2", maxlength: "2000" }));
  const blockField = h("div", { class: "field" }, h("label", { for: "f-block" }, "Blocker notes"), blockInput);
  const archivedNotice = h("p", { class: "notice", hidden: true }, "This task is archived. Restore it to see it on the board again.");

  const completeBox = h("span");
  const archiveBtn = h("button", { type: "button", class: "btn btn-ghost" });
  const deleteBtn = h("button", { type: "button", class: "btn btn-ghost danger" }, icon("trash"), "Delete");
  const heading = h("h2", { id: "panel-title-h", tabindex: "-1" });

  const form = h(
    "form",
    { class: "panel-body", id: "task-form" },
    archivedNotice,
    h("div", { class: "field" }, h("label", { for: "f-title" }, "Title"), titleInput),
    h(
      "div",
      { class: "grid2" },
      h("div", { class: "field" }, h("label", { for: "f-status" }, "Status"), statusSel),
      h("div", { class: "field" }, h("label", { for: "f-priority" }, "Priority"), prioritySel),
      h("div", { class: "field" }, h("label", { for: "f-due" }, "Due date"), dueInput, dueHint),
      h("div", { class: "field" }, h("label", { for: "f-cat" }, "Category"), categorySel),
    ),
    h("fieldset", { class: "field" }, h("legend", null, "Assignees"), chipsBox),
    h("div", { class: "field" }, h("label", { for: "f-url" }, "Website page URL or section"), h("div", { class: "row" }, urlInput, openLink)),
    h("div", { class: "field" }, h("label", { for: "f-desc" }, "Description"), descInput),
  );

  // Subtasks (existing tasks only)
  const subList = h("ul", { class: "sublist" });
  const subCount = h("span", { class: "muted", "aria-live": "polite" });
  const subProgress = h("progress", { "aria-label": "Subtask progress", hidden: true });
  const subInput = h("input", { id: "new-sub", maxlength: "200", placeholder: "Add a subtask" });
  const subAdd = h("button", { type: "button", class: "btn", disabled: true }, "Add");
  const subBlock = h(
    "section",
    { class: "subtasks-block", "aria-labelledby": "sub-h" },
    h("div", { class: "row between" }, h("h3", { id: "sub-h" }, "Subtasks"), subCount),
    subProgress,
    subList,
    h("div", { class: "row" }, h("label", { for: "new-sub", class: "sr-only" }, "New subtask"), subInput, subAdd),
  );
  if (!isNew) form.append(subBlock);
  form.append(blockField);

  // Dock: conflict notice + save bar
  const conflictBox = h("div", { class: "notice notice-warn", role: "alert", hidden: true });
  const saveNote = h("span", { class: "savebar-note" });
  const discardBtn = h("button", { type: "button", class: "btn" }, "Discard");
  const saveBtn = h("button", { type: "submit", form: "task-form", class: "btn btn-primary" });
  const saveBar = h("div", { class: "savebar", hidden: true }, saveNote, h("span", { class: "spacer" }), discardBtn, saveBtn);
  const dock = h("div", { class: "dock" }, conflictBox, saveBar);

  // Comments / activity (existing tasks only)
  const tabComments = h("button", { type: "button", role: "tab", id: "tab-comments", "aria-controls": "tabpanel" }, "Comments");
  const tabActivity = h("button", { type: "button", role: "tab", id: "tab-activity", "aria-controls": "tabpanel" }, "Activity");
  const threadBox = h("div");
  const commentInput = h("textarea", { id: "new-comment", rows: "2", maxlength: "2000", placeholder: "Write a comment" });
  const commentBtn = h("button", { type: "submit", class: "btn", disabled: true }, "Post comment");
  const commentForm = h("form", { class: "comment-form" }, h("label", { for: "new-comment", class: "sr-only" }, "Add a comment"), commentInput, commentBtn);
  const tabPanel = h("div", { id: "tabpanel", role: "tabpanel" }, threadBox, commentForm);
  const tabsBox = h("div", { class: "panel-tabs" }, h("div", { role: "tablist", "aria-label": "Discussion and history", class: "tablist" }, tabComments, tabActivity), tabPanel);

  const el = h(
    "aside",
    { class: "panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "panel-title-h" },
    h(
      "div",
      { class: "panel-head" },
      completeBox,
      heading,
      h("span", { class: "spacer" }),
      !isNew && archiveBtn,
      !isNew && deleteBtn,
      h("button", { type: "button", class: "btn btn-icon btn-ghost", "aria-label": "Close task panel", onClick: () => requestClose() }, icon("close")),
    ),
    form,
    dock,
    !isNew && tabsBox,
  );

  // ---------- Rendering ----------

  function renderChips() {
    const selected = val("assignees");
    chipsBox.replaceChildren(
      ...(members.length
        ? members.map((m) => {
            const input = h("input", { type: "checkbox", checked: selected.includes(m.id) });
            input.addEventListener("change", () => {
              const cur = val("assignees");
              setField("assignees", input.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id));
            });
            return h("label", { class: "chip-check" }, input, h("span", null, m.name + (m.id === me.id ? " (you)" : "")));
          })
        : [h("p", { class: "empty-note" }, "No one has joined this workspace yet.")]),
    );
  }

  let chipsSig = "";
  function renderFields() {
    for (const k of ["title", "description", "pageUrl", "blockerNotes"]) setValue(els[k], val(k));
    setValue(prioritySel, val("priority"));
    setValue(categorySel, val("category"));
    setValue(dueInput, val("dueDate") ?? "");
    setValue(statusSel, status());
    const sig = JSON.stringify([members.map((m) => [m.id, m.name]), val("assignees")]);
    if (sig !== chipsSig) {
      chipsSig = sig;
      renderChips();
    }
    const link = asLink(val("pageUrl"));
    openLink.hidden = !link;
    if (link) openLink.href = link;
    const due = task && !("dueDate" in draft) ? dueInfo(task) : null;
    dueHint.hidden = !due;
    if (due) {
      dueHint.textContent = due.label;
      dueHint.className = cx("hint", due.overdue && "hint-overdue");
    }
    blockField.className = cx("field", status() === "blocked" && "field-emphasis");
    blockInput.placeholder = status() === "blocked" ? "What is this waiting on, and from whom?" : "Add notes if something is in the way";
  }

  function renderHeader() {
    const done = status() === "done";
    heading.textContent = isNew ? "Add task" : done ? "Task (done)" : "Task";
    if (task) {
      completeBox.replaceChildren(
        checkbox({
          checked: done,
          label: done ? "Mark not done" : "Mark done",
          onChange: (checked) => run("Updating the task", () => actions.setCompleted({ id: task._id, completed: checked })),
        }),
      );
      archiveBtn.replaceChildren(icon(task.archived ? "restore" : "archive"), task.archived ? "Restore" : "Archive");
      archivedNotice.hidden = !task.archived;
    }
  }

  let subSig = "";
  function renderSubtasks() {
    if (!task) return;
    const sig = JSON.stringify(task.subtasks);
    if (sig === subSig) return;
    subSig = sig;
    const done = task.subtasks.filter((s) => s.done).length;
    subCount.textContent = task.subtasks.length ? `${done} of ${task.subtasks.length} done` : "";
    subProgress.hidden = !task.subtasks.length;
    subProgress.max = task.subtasks.length || 1;
    subProgress.value = done;
    subList.replaceChildren(
      ...task.subtasks.map((s) => {
        const input = h("input", { type: "checkbox", checked: s.done });
        input.addEventListener("change", async () => {
          await run("Updating the subtask", () => actions.toggleSubtask({ id: task._id, subtaskId: s.id, done: input.checked }));
          input.checked = s.done;
        });
        return h(
          "li",
          null,
          h("label", { class: "sub-item" }, input, h("span", { class: cx(s.done && "struck") }, s.title)),
          h("button", { type: "button", class: "btn btn-icon btn-ghost", "aria-label": `Remove subtask: ${s.title}`, onClick: () => run("Removing the subtask", () => actions.removeSubtask({ id: task._id, subtaskId: s.id })) }, icon("close", 14)),
        );
      }),
    );
  }

  function renderDock() {
    const dirty = isDirty();
    conflictBox.hidden = !conflicts.length;
    if (conflicts.length) {
      conflictBox.replaceChildren(
        h("p", null, `${other()?.name ?? "Your teammate"} changed ${conflicts.map((c) => FIELD_LABEL[c].toLowerCase()).join(", ")} while you were editing. Your version has not been saved.`),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-sm", onClick: useTheirs }, "Use their version"), h("button", { type: "button", class: "btn btn-sm btn-primary", onClick: () => save(true) }, "Keep my version")),
      );
    }
    const show = isNew || (dirty && !settling);
    saveBar.hidden = !show;
    saveNote.textContent = isNew ? `Will be added to ${STATUS_LABEL[newStatus]}` : "Unsaved changes";
    discardBtn.hidden = isNew;
    saveBtn.disabled = saving;
    saveBtn.textContent = saving ? "Saving…" : isNew ? "Add task" : "Save changes";
  }

  function renderTabs() {
    if (isNew) return;
    tabComments.setAttribute("aria-selected", String(tab === "comments"));
    tabActivity.setAttribute("aria-selected", String(tab === "activity"));
    tabPanel.setAttribute("aria-labelledby", `tab-${tab}`);
    commentForm.hidden = tab !== "comments";
    if (tab === "comments") {
      threadBox.replaceChildren(
        comments === undefined
          ? h("p", { class: "muted" }, "Loading comments…")
          : comments.length === 0
            ? h("p", { class: "muted" }, "No comments yet. Use comments for decisions and questions about this task.")
            : h(
                "ul",
                { class: "thread" },
                comments.map((c) =>
                  h(
                    "li",
                    null,
                    h("p", { class: "thread-meta" }, h("strong", null, c.authorId === me.id ? "You" : nameOf(c.authorId)), h("time", { datetime: new Date(c._creationTime).toISOString() }, formatDateTime(c._creationTime))),
                    h("p", { class: "thread-body" }, c.body),
                  ),
                ),
              ),
      );
    } else {
      threadBox.replaceChildren(
        activity === undefined
          ? h("p", { class: "muted" }, "Loading history…")
          : h(
              "ol",
              { class: "activity" },
              [...activity].reverse().map((a) => h("li", null, h("span", null, h("strong", null, nameOf(a.actorId)), " ", a.message), h("time", { datetime: new Date(a._creationTime).toISOString() }, formatDateTime(a._creationTime)))),
            ),
      );
    }
  }

  function refresh() {
    if (settling && Object.keys(draft).every((k) => sameValue(live()[k], draft[k]))) clearDraft();
    renderHeader();
    renderFields();
    renderSubtasks();
    renderDock();
  }

  function clearDraft() {
    draft = {};
    base = {};
    settling = false;
    clearTimeout(settleTimer);
  }

  // ---------- Editing ----------

  function setField(k, v) {
    if (!(k in base)) base[k] = live()[k];
    if (sameValue(v, base[k]) && !isNew) {
      delete draft[k];
      delete base[k];
    } else draft[k] = v;
    conflicts = conflicts.filter((x) => x !== k);
    if (k === "assignees") chipsSig = JSON.stringify([members.map((m) => [m.id, m.name]), val("assignees")]);
    if (k === "pageUrl" || k === "dueDate") renderFields();
    renderDock();
  }

  titleInput.addEventListener("input", () => setField("title", titleInput.value));
  descInput.addEventListener("input", () => setField("description", descInput.value));
  blockInput.addEventListener("input", () => setField("blockerNotes", blockInput.value));
  urlInput.addEventListener("input", () => setField("pageUrl", urlInput.value));
  prioritySel.addEventListener("change", () => setField("priority", prioritySel.value));
  categorySel.addEventListener("change", () => setField("category", categorySel.value));
  dueInput.addEventListener("input", () => setField("dueDate", dueInput.value || null));
  statusSel.addEventListener("change", async () => {
    const s = statusSel.value;
    if (task) {
      const res = await run("Moving the task", () => actions.move({ id: task._id, status: s }));
      if (res === undefined) renderFields(); // failed: show the real status again
    } else {
      newStatus = s;
      renderDock();
    }
  });

  async function save(overwrite = false) {
    if (isNew) {
      const f = { ...defaults, ...draft };
      if (!f.title.trim()) return titleInput.focus();
      saving = true;
      renderDock();
      const id = await run("Adding the task", () => actions.create({ ...f, status: newStatus }));
      saving = false;
      renderDock();
      if (id) onCreated(id);
      return;
    }
    if (draft.title !== undefined && !draft.title.trim()) return titleInput.focus();
    const baseForSave = overwrite ? toEditable(task) : base;
    saving = true;
    renderDock();
    const res = await run("Saving changes", () => actions.update({ id: task._id, patch: draft, base: baseForSave }));
    saving = false;
    if (res?.ok) {
      settling = true; // keep showing the saved values until the live copy catches up
      conflicts = [];
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => (clearDraft(), refresh()), 3000);
      refresh();
    } else {
      if (res) conflicts = res.conflicts;
      renderDock();
    }
  }

  function useTheirs() {
    for (const k of conflicts) {
      delete draft[k];
      delete base[k];
    }
    conflicts = [];
    chipsSig = "";
    refresh();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void save();
  });
  discardBtn.addEventListener("click", () => {
    clearDraft();
    conflicts = [];
    chipsSig = "";
    refresh();
  });

  // Subtasks
  subInput.addEventListener("input", () => (subAdd.disabled = !subInput.value.trim()));
  subInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      subAdd.click();
    }
  });
  subAdd.addEventListener("click", async () => {
    const text = subInput.value;
    subInput.value = "";
    subAdd.disabled = true;
    const ok = await run("Adding the subtask", () => actions.addSubtask({ id: task._id, title: text }));
    if (ok === undefined) {
      subInput.value = text;
      subAdd.disabled = false;
    }
  });

  // Comments
  commentInput.addEventListener("input", () => (commentBtn.disabled = !commentInput.value.trim()));
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = commentInput.value.trim();
    if (!body) return;
    commentBtn.disabled = true;
    const ok = await run("Posting the comment", () => actions.addComment({ id: task._id, body }));
    if (ok !== undefined) commentInput.value = "";
    commentBtn.disabled = !commentInput.value.trim();
  });
  tabComments.addEventListener("click", () => ((tab = "comments"), renderTabs()));
  tabActivity.addEventListener("click", () => ((tab = "activity"), renderTabs()));

  // Archive / delete
  archiveBtn.addEventListener("click", () => run("Archiving the task", () => actions.setArchived({ id: task._id, archived: !task.archived })));
  deleteBtn.addEventListener("click", () => {
    const dlg = dialog({ title: "Delete this task?" });
    dlg.body.append(
      h("p", null, `“${task.title}” and its comments and history will be removed for both of you. This can't be undone. To keep a record, archive it instead.`),
      h(
        "div",
        { class: "row end" },
        h("button", { type: "button", class: "btn", onClick: () => dlg.close() }, "Cancel"),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-danger",
            onClick: async () => {
              const id = task._id;
              dlg.close();
              const ok = await run("Deleting the task", () => actions.remove({ id }));
              if (ok !== undefined) onClose();
            },
          },
          "Delete task",
        ),
      ),
    );
  });

  // ---------- Lifecycle ----------

  function requestClose() {
    if (isDirty() && !window.confirm("Discard your unsaved changes?")) return;
    onClose();
  }
  const onKey = (e) => {
    if (e.key === "Escape" && !document.querySelector(".menu, .dialog")) requestClose();
  };
  document.addEventListener("keydown", onKey);

  if (task) {
    const syncThread = () => {
      comments = store.commentsFor(task._id);
      activity = store.activityFor(task._id);
      renderTabs();
    };
    syncThread();
    unsubs.push(store.subscribe(syncThread));
  }

  refresh();
  renderTabs();
  setTimeout(() => (isNew ? titleInput : heading).focus(), 0);

  return {
    el,
    taskId: task?._id,
    /** Called whenever the board data changes. */
    update(nextTask, nextMembers) {
      if (nextTask) task = nextTask;
      members = nextMembers;
      refresh();
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      unsubs.forEach((u) => u());
      clearTimeout(settleTimer);
    },
  };
}
