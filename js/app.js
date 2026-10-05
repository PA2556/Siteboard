// Site Board: entry point. First run shows setup; after that the board. All data lives in this browser (see store.js).
import * as store from "./store.js";
import { setupScreen } from "./setup-ui.js";
import { createBoard } from "./board.js";
import { createPanel } from "./panel.js";
import { openPeopleDialog } from "./people.js";
import { h, icon, avatar, brandMark, menuButton, notify, replaceChildren } from "./dom.js";
import { CATEGORIES, PRIORITIES, STATUSES, STATUS_LABEL, NO_FILTERS, activeFilterCount, matches, dueInfo, formatDate } from "./model.js";

const root = document.getElementById("app");
let screen = null; // "setup" | "workspace"
let view = null;

/** Shape the UI expects: who is using the board, and who is on it. */
function viewModel(state) {
  const members = state.people.map((p) => ({ id: p.id, name: p.name, email: "", role: "member" }));
  const user = members.find((m) => m.id === state.meId) ?? members[0];
  return { user, workspace: { name: state.boardName, members }, tasks: state.tasks, comments: state.comments };
}

function route() {
  const state = store.getState();
  if (!state.people.length) {
    if (screen !== "setup") {
      screen = "setup";
      view = null;
      replaceChildren(root, setupScreen());
    }
    return;
  }
  if (screen !== "workspace") {
    screen = "workspace";
    view = createWorkspaceView();
    replaceChildren(root, view.el);
  }
  view.update(viewModel(state));
}

store.subscribe(route);
route();
// Re-evaluate "overdue" and similar when the tab comes back after a while.
document.addEventListener("visibilitychange", () => !document.hidden && view?.update(viewModel(store.getState())));

// ---------- Workspace view ----------

function createWorkspaceView() {
  let vm = viewModel(store.getState());
  let filters = { ...NO_FILTERS };
  let filtersOpen = false;
  let hash = readHash();
  let seenTaskId = null;
  let panel = null;
  let people = null;

  const actions = store.actions;
  const board = createBoard({ actions, onOpen: (id) => go(`task/${id}`) });

  // Top bar
  const wsName = h("p", { class: "ws-name" });
  const sync = h("span", { class: "sync", title: "Everything is saved in this browser, on this device only" }, h("span", { class: "sync-dot", "aria-hidden": "true" }), h("span", { class: "sync-long" }, "Saved on this device"), h("span", { class: "sync-short" }, "Saved"));
  const accountSlot = h("span");
  const topbar = h(
    "header",
    { class: "topbar" },
    h("div", { class: "topbar-left" }, h("p", { class: "brand" }, brandMark(), "Site Board"), wsName),
    h("div", { class: "topbar-right" }, sync, h("button", { type: "button", class: "btn btn-ghost", onClick: openPeople }, "Team"), accountSlot),
  );
  const banner = h("p", { class: "banner", role: "alert" }, "This browser is blocking storage (private windows often do), so changes won't be kept after you close the page. Open the board in a normal window.");
  banner.hidden = store.storageWorks();

  // Toolbar
  const segBtn = (label, onClick) => {
    const count = h("span", { class: "seg-count" });
    return { b: h("button", { type: "button", onClick }, label, " ", count), count };
  };
  const segAll = segBtn("All tasks", () => (go(""), setFilter("assignee", "all")));
  const segMine = segBtn("My tasks", () => (go(""), setFilter("assignee", vm.user.id)));
  const segArchived = segBtn("Archived", () => go("archive"));
  const searchInput = h("input", { id: "search", type: "search", placeholder: "Search tasks, pages, subtasks" });
  searchInput.addEventListener("input", () => setFilter("q", searchInput.value));
  const searchWrap = h("div", { class: "search" }, icon("search"), h("label", { for: "search", class: "sr-only" }, "Search tasks"), searchInput);
  const filtersToggle = h("button", { type: "button", class: "btn filters-toggle", "aria-expanded": "false", "aria-controls": "filters", onClick: () => ((filtersOpen = !filtersOpen), renderToolbar()) });
  const addBtn = h("button", { type: "button", class: "btn btn-primary", onClick: () => go("new") }, icon("plus"), "Add task");

  const selects = {};
  const mkSelect = (key, label) => {
    const id = `flt-${label.replace(/\s/g, "-").toLowerCase()}`;
    const sel = h("select", { id });
    sel.addEventListener("change", () => setFilter(key, sel.value));
    selects[key] = sel;
    return h("div", { class: "field field-inline" }, h("label", { for: id }, label), sel);
  };
  const setOptions = (sel, options) => {
    const cur = sel.value;
    sel.replaceChildren(...options.map(([v, t]) => h("option", { value: v }, t)));
    sel.value = options.some(([v]) => v === cur) ? cur : options[0][0];
  };
  const filterBox = h("div", { id: "filters", class: "filters" }, mkSelect("assignee", "Assignee"), mkSelect("priority", "Priority"), mkSelect("status", "Status"), mkSelect("category", "Category"), mkSelect("due", "Due date"));
  setOptions(selects.priority, [["all", "Any priority"], ...PRIORITIES.map((p) => [p.id, p.label])]);
  setOptions(selects.status, [["all", "Any status"], ...STATUSES.map((s) => [s.id, s.label])]);
  setOptions(selects.category, [["all", "Any category"], ...CATEGORIES.map((c) => [c.id, c.label])]);
  setOptions(selects.due, [["all", "Any time"], ["overdue", "Overdue"], ["today", "Due today"], ["week", "Due in 7 days"], ["none", "No due date"]]);

  const summary = h("p", { class: "summary", "aria-live": "polite" });
  const filterArea = h("div", { class: "filter-area" }, filterBox, summary);
  const toolbar = h(
    "div",
    { class: "toolbar" },
    h("div", { class: "toolbar-row" }, h("div", { class: "segmented", role: "group", "aria-label": "Which tasks to show" }, segAll.b, segMine.b, segArchived.b), searchWrap, filtersToggle, addBtn),
    filterArea,
  );

  // Main area
  const main = h("main", { class: "main" });
  const archiveList = h("ul", { class: "archive" });
  const emptyBoard = h(
    "div",
    { class: "empty-board" },
    h("h2", null, "No tasks yet"),
    h("p", null, "Add the first website task for you and your teammate."),
    h("button", { type: "button", class: "btn btn-primary", onClick: () => go("new") }, icon("plus"), "Add task"),
  );

  const el = h("div", { class: "app" }, topbar, banner, toolbar, main);

  // ---------- Routing ----------

  function readHash() {
    return location.hash.replace(/^#\/?/, "");
  }
  function go(r) {
    if (r) location.hash = `/${r}`;
    else {
      history.replaceState(null, "", location.pathname + location.search);
      hash = "";
      renderAll();
    }
  }
  window.addEventListener("hashchange", () => {
    hash = readHash();
    renderAll();
  });

  function setFilter(key, value) {
    filters = { ...filters, [key]: value };
    renderAll();
  }

  function openPeople() {
    people = openPeopleDialog({ onClose: () => (people = null) });
  }

  // ---------- Rendering ----------

  let accountSig = "";
  function renderTopbar() {
    wsName.textContent = vm.workspace.name;
    wsName.hidden = !vm.workspace.name;
    const sig = JSON.stringify([vm.user, vm.workspace.members]);
    if (sig === accountSig) return;
    accountSig = sig;
    const idx = vm.workspace.members.findIndex((m) => m.id === vm.user.id);
    const others = vm.workspace.members.filter((m) => m.id !== vm.user.id);
    accountSlot.replaceChildren(
      menuButton({
        label: `Using the board as ${vm.user.name}`,
        className: "btn btn-ghost account",
        content: [avatar(vm.user.name, idx), h("span", { class: "account-name" }, vm.user.name.split(" ")[0])],
        items: [
          { label: `Using the board as ${vm.user.name}`, onSelect: () => {} },
          ...others.map((m, i) => ({ label: `Switch to ${m.name}`, separatorBefore: i === 0, onSelect: () => store.switchUser(m.id) })),
          { label: "Team and backup…", separatorBefore: true, onSelect: openPeople },
        ],
      }),
    );
  }

  let memberSig = "";
  function renderToolbar() {
    const user = vm.user;
    const all = vm.tasks;
    const active = all.filter((t) => !t.archived);
    const archived = all.filter((t) => t.archived);
    const hasAny = all.length > 0;
    const archiveView = hash.split("/")[0] === "archive";
    const mine = filters.assignee === user.id;
    const nFilters = activeFilterCount(filters);
    const shown = active.filter((t) => matches(t, filters));
    const overdue = active.filter((t) => dueInfo(t)?.overdue).length;
    const otherMember = vm.workspace.members.find((m) => m.id !== user.id);

    segAll.count.textContent = String(active.length);
    segMine.count.textContent = String(active.filter((t) => t.assignees.includes(user.id) && t.status !== "done").length);
    segArchived.count.textContent = String(archived.length);
    segAll.b.setAttribute("aria-pressed", String(!mine && !archiveView));
    segMine.b.setAttribute("aria-pressed", String(mine && !archiveView));
    segArchived.b.setAttribute("aria-pressed", String(archiveView));

    searchWrap.hidden = !hasAny;
    filtersToggle.hidden = !hasAny;
    filterArea.hidden = !hasAny;
    const activeCount = nFilters - (filters.q ? 1 : 0) - (mine ? 1 : 0);
    filtersToggle.textContent = `Filters${activeCount > 0 ? ` (${activeCount})` : ""}`;
    filtersToggle.setAttribute("aria-expanded", String(filtersOpen));
    filterBox.classList.toggle("open", filtersOpen);

    const sig = JSON.stringify(vm.workspace.members.map((m) => [m.id, m.name]));
    if (sig !== memberSig) {
      memberSig = sig;
      setOptions(selects.assignee, [["all", "Anyone"], [user.id, "Me"], ...(otherMember ? [[otherMember.id, otherMember.name]] : []), ["unassigned", "Unassigned"]]);
    }
    if (filters.assignee !== "all" && filters.assignee !== "unassigned" && !vm.workspace.members.some((m) => m.id === filters.assignee)) filters = { ...filters, assignee: "all" };
    for (const k of Object.keys(selects)) if (selects[k].value !== filters[k]) selects[k].value = filters[k];
    if (searchInput.value !== filters.q) searchInput.value = filters.q;

    replaceChildren(
      summary,
      archiveView ? `${archived.length} archived ${archived.length === 1 ? "task" : "tasks"}` : `Showing ${shown.length} of ${active.length} tasks${overdue ? ` · ${overdue} overdue` : ""}`,
      nFilters > 0 && !archiveView && [" ", h("button", { type: "button", class: "link-button", onClick: () => ((filters = { ...NO_FILTERS }), renderAll()) }, mine ? "Show all tasks" : "Clear filters")],
    );
    return { shown, active, archived, archiveView, nFilters };
  }

  function renderArchive(archived) {
    const members = vm.workspace.members;
    archiveList.replaceChildren(
      ...archived.map((t) =>
        h(
          "li",
          null,
          h("button", { type: "button", class: "card-title", onClick: () => go(`task/${t._id}`) }, t.title),
          h("span", { class: "muted" }, `${STATUS_LABEL[t.status]}${t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}${t.assignees.length ? ` · ${t.assignees.map((id) => members.find((m) => m.id === id)?.name.split(" ")[0]).join(" + ")}` : ""}`),
        ),
      ),
    );
  }

  function newStatusFromHash() {
    const [v, id] = hash.split("/");
    return v === "new" && STATUSES.some((s) => s.id === id) ? id : "todo";
  }

  function closePanel() {
    if (!panel) return;
    panel.destroy();
    panel.el.remove();
    panel = null;
  }

  function renderMain({ shown, active, archived, archiveView, nFilters }) {
    const [route, id] = hash.split("/");
    const members = vm.workspace.members;
    let content;
    if (archiveView) {
      content = archived.length ? (renderArchive(archived), archiveList) : h("p", { class: "empty" }, "Nothing archived. Archive a task from its card menu to keep it out of the way without deleting it.");
    } else if (active.length === 0) content = emptyBoard;
    else {
      content = board.el;
      board.update({ tasks: shown, members, visibleStatuses: filters.status === "all" ? STATUSES.map((s) => s.id) : [filters.status], filtered: nFilters > 0 });
    }
    if (main.firstChild !== content) {
      const first = main.firstChild;
      if (first && first !== (panel && panel.el)) first.replaceWith(content);
      else main.prepend(content);
    }

    // Task panel
    const task = route === "task" ? vm.tasks.find((t) => t._id === id) : undefined;
    if (route === "task" && !task) {
      if (seenTaskId === id) notify("That task was deleted.");
      seenTaskId = null;
      closePanel();
      return go(archiveView ? "archive" : "");
    }
    if (task) seenTaskId = id;
    if (route !== "new" && !task) return closePanel();

    const key = route === "new" ? `new-${newStatusFromHash()}` : task._id;
    if (!panel || panel.key !== key) {
      closePanel();
      const p = createPanel({
        task: route === "new" ? null : task,
        newStatus: newStatusFromHash(),
        me: vm.user,
        members,
        actions,
        onClose: () => go(archiveView ? "archive" : ""),
        onCreated: (newId) => go(`task/${newId}`),
      });
      panel = { ...p, key };
      main.append(p.el);
    } else {
      panel.update(task ?? null, members);
    }
  }

  function renderAll() {
    renderTopbar();
    renderMain(renderToolbar());
    people?.update();
  }

  return {
    el,
    update(nextVm) {
      vm = nextVm;
      renderAll();
    },
  };
}
