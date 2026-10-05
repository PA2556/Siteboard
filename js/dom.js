// Small DOM toolkit: element builder, icons, menu, dialog, toasts.
import { PRIORITIES, firstName, initials } from "./model.js";

/** h("div", { class: "x", onClick: fn, "aria-label": "y" }, child, "text", [more]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "value" || k === "checked" || k === "disabled" || k === "readOnly" || k === "indeterminate") el[k] = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function replaceChildren(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const cx = (...parts) => parts.filter(Boolean).join(" ");

/** Set a form control's value the way a person would, without firing handlers. */
export function setValue(el, value) {
  if (el.value !== value) el.value = value;
}

// ---------- Icons ----------

const PATHS = {
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  more: '<circle cx="3.5" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  link: '<path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/>',
  archive: '<path d="M2.5 4h11v2h-11zM3.5 6v6.5h9V6M6.5 8.5h3"/>',
  trash: '<path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.5 8.5h6l.5-8.5"/>',
  restore: '<path d="M3.5 8a4.5 4.5 0 108.2-2.5M3 3.5V7h3.5"/>',
  alert: '<path d="M8 2.5l6 10.5H2zM8 6.5v3M8 11.3v.2"/>',
  calendar: '<path d="M2.5 4.5h11v9h-11zM2.5 7.5h11M5.5 2.5v3M10.5 2.5v3"/>',
  "chevron-up": '<path d="M4 9.5l4-4 4 4"/>',
  "chevron-down": '<path d="M4 6.5l4 4 4-4"/>',
  "chevrons-up": '<path d="M4 7.5l4-4 4 4M4 12.5l4-4 4 4"/>',
  equals: '<path d="M3.5 6h9M3.5 10h9"/>',
  list: '<path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.1M2.5 8h.1M2.5 11.5h.1"/>',
};

function svg(inner, size, attrs = "") {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${attrs}>${inner}</svg>`;
  return wrap.firstChild;
}

export const icon = (name, size = 16) => svg(PATHS[name], size);

const STATUS_SHAPES = {
  backlog: '<circle cx="8" cy="8" r="5.5" stroke-dasharray="2.2 2.2"/>',
  todo: '<circle cx="8" cy="8" r="5.5"/>',
  in_progress: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor"/>',
  needs_review: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>',
  blocked: '<circle cx="8" cy="8" r="5.5"/><path d="M4.2 11.8l7.6-7.6"/>',
  done: '<circle cx="8" cy="8" r="5.5" fill="currentColor"/><path d="M5.4 8.2l1.8 1.8 3.4-3.6" stroke="#0a0a0b"/>',
};
/** Each status has its own shape so columns are distinguishable without colour. */
export const statusIcon = (status) => svg(STATUS_SHAPES[status], 16);

export function brandMark(size = 28) {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true" focusable="false" class="brand-mark"><rect width="28" height="28" rx="8" fill="#E11D2E"/><rect x="7" y="7" width="6" height="14" rx="2" fill="#fff"/><rect x="15" y="7" width="6" height="8" rx="2" fill="#fff"/></svg>`;
  return wrap.firstChild;
}

export const avatar = (name, index) => h("span", { class: cx("avatar", index === 0 ? "avatar-a" : "avatar-b"), "aria-hidden": "true" }, initials(name));

/** Assignee summary: avatars plus first names, full names in the accessible label. */
export function assignees(ids, members) {
  const people = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  if (!people.length) return h("span", { class: "muted" }, "Unassigned");
  return h(
    "span",
    { class: "assignees", "aria-label": `Assigned to ${people.map((p) => p.name).join(" and ")}` },
    people.map((p) => avatar(p.name, members.findIndex((m) => m.id === p.id))),
    h("span", { class: "assignee-names" }, people.map((p) => firstName(p.name)).join(" + ")),
  );
}

const PRIORITY_ICON = { urgent: "chevrons-up", high: "chevron-up", normal: "equals", low: "chevron-down" };

/** Priority is always spelled out; the icon shape and badge style reinforce it without relying on colour. */
export function priorityMark(priority) {
  const label = PRIORITIES.find((p) => p.id === priority).label;
  return h("span", { class: `priority priority-${priority}` }, icon(PRIORITY_ICON[priority], 13), label);
}

export function checkbox({ checked, label, disabled, onChange }) {
  const input = h("input", { type: "checkbox", checked: !!checked, disabled: !!disabled, "aria-label": label });
  input.addEventListener("change", async () => {
    await onChange?.(input.checked);
    input.checked = !!checked; // if the save failed this element survives, so show the real state again
  });
  return h("label", { class: "check", title: checked ? "Mark as not done" : "Mark as done" }, input, h("span", { class: "check-box", "aria-hidden": "true" }, icon("check", 12)));
}

// ---------- Menu ----------

let openMenu = null;
export function closeMenu() {
  openMenu?.close();
}

/**
 * Button that opens an action menu. items: [{label, onSelect, checked?, danger?, separatorBefore?}]
 * getItems may be a function so the list reflects current state each time it opens.
 */
export function menuButton({ label, items, className = "btn btn-icon btn-ghost", content }) {
  const btn = h("button", { type: "button", class: className, "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": label }, content ?? icon("more"));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openMenu?.btn === btn) return closeMenu();
    closeMenu();
    show();
  });

  function show() {
    const list = typeof items === "function" ? items() : items;
    const menu = h("div", { class: "menu", role: "menu", "aria-label": label });
    for (const it of list) {
      if (it.separatorBefore) menu.append(h("div", { class: "menu-sep", role: "separator" }));
      const b = h(
        "button",
        { type: "button", role: it.checked === undefined ? "menuitem" : "menuitemradio", "aria-checked": it.checked === undefined ? undefined : String(!!it.checked), class: cx("menu-item", it.danger && "danger") },
        h("span", { class: "menu-check", "aria-hidden": "true" }, it.checked ? icon("check", 14) : null),
        it.label,
      );
      b.addEventListener("click", () => {
        close();
        btn.focus();
        it.onSelect();
      });
      menu.append(b);
    }
    document.body.append(menu);
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth || 216;
    menu.style.left = `${Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)}px`;
    menu.style.top = `${Math.min(r.bottom + 4, Math.max(8, window.innerHeight - menu.offsetHeight - 8))}px`;
    btn.setAttribute("aria-expanded", "true");

    const buttons = () => [...menu.querySelectorAll("button")];
    (menu.querySelector('[aria-checked="true"]') || buttons()[0])?.focus();

    const onKey = (e) => {
      const els = buttons();
      const i = els.indexOf(document.activeElement);
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        btn.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        els[(i + 1) % els.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        els[(i - 1 + els.length) % els.length]?.focus();
      } else if (e.key === "Tab") close();
    };
    const onDown = (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) close();
    };
    const onScroll = (e) => {
      if (!menu.contains(e.target)) close();
    };
    menu.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", onScroll, true);

    function close() {
      menu.remove();
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", onScroll, true);
      if (openMenu?.btn === btn) openMenu = null;
    }
    openMenu = { btn, close };
  }
  return btn;
}

// ---------- Dialog ----------

/** Modal dialog with focus containment, Escape and backdrop click to close. Returns { el, body, close }. */
export function dialog({ title, onClose }) {
  const previous = document.activeElement;
  const body = h("div", { class: "dialog-body" });
  const box = h(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "dialog-head" }, h("h2", null, title), h("button", { type: "button", class: "btn btn-icon btn-ghost", "aria-label": "Close", onClick: () => close() }, icon("close"))),
    body,
  );
  const scrim = h("div", { class: "scrim" }, box);
  scrim.addEventListener("mousedown", (e) => e.target === scrim && close());
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") {
      const f = [...box.querySelectorAll("button, input, textarea, select, a[href]")].filter((el) => !el.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });
  document.body.append(scrim);
  setTimeout(() => box.querySelector("input, button:not(.btn-icon), textarea, select")?.focus(), 0);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    scrim.remove();
    previous?.focus?.();
    onClose?.();
  }
  return { el: box, body, close };
}

// ---------- Toasts ----------

/** The first line of an error's message, for showing to people. */
export const errorText = (e) => String(e instanceof Error ? e.message : e).split(/\r?\n/)[0];

let toastHost;
function host() {
  if (!toastHost) {
    toastHost = h("div", { class: "toasts", role: "region", "aria-label": "Notifications" });
    document.body.append(toastHost);
  }
  return toastHost;
}

function showToast(message, tone, retry) {
  const el = h(
    "div",
    { class: `toast toast-${tone}`, role: tone === "error" ? "alert" : "status" },
    h("p", null, message),
    retry && h("button", { type: "button", class: "btn btn-sm", onClick: () => (el.remove(), retry()) }, "Retry"),
    tone === "error" && h("button", { type: "button", class: "btn btn-sm btn-ghost", onClick: () => el.remove() }, "Dismiss"),
  );
  const container = host();
  while (container.children.length > 3) container.firstChild.remove();
  container.append(el);
  if (tone === "info") setTimeout(() => el.remove(), 4000);
}

export const notify = (message) => showToast(message, "info");

/** Run an async save. On failure, shows the reason with a Retry button. Resolves to the result, or undefined on failure. */
export async function run(label, fn) {
  try {
    return await fn();
  } catch (e) {
    showToast(`${label} failed. ${errorText(e)}`, "error", () => void run(label, fn));
    return undefined;
  }
}
