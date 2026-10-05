// First-run screen: who is using this board.
import { h, brandMark, errorText } from "./dom.js";
import { setup, storageWorks } from "./store.js";

export function setupScreen() {
  const error = h("p", { class: "form-error", role: "alert", hidden: true });
  const submit = h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Start using the board");
  const field = (id, label, attrs, hint) => h("div", { class: "field" }, h("label", { for: id }, label), h("input", { id, name: id, ...attrs }), hint && h("p", { class: "hint" }, hint));

  const form = h(
    "form",
    { class: "auth-form-inner" },
    h("h2", null, "Set up your board"),
    field("name", "Your name", { autocomplete: "name", required: true, maxlength: "80" }),
    field("otherName", "Your teammate's name (optional)", { maxlength: "80" }, "Add them now to assign tasks to them, or later from the Team menu."),
    field("boardName", "Board name (optional)", { maxlength: "80", placeholder: "For example, your district or team name" }),
    error,
    submit,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form).entries());
    try {
      setup({ name: v.name, otherName: v.otherName, boardName: v.boardName });
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
    }
  });

  const notes = [
    h("p", { class: "auth-note" }, "Everything is saved in this browser, on this device only. Tasks are not shared with other people or devices. Use Backup in the Team menu to keep a copy or move it."),
  ];
  if (!storageWorks()) {
    notes.push(h("p", { class: "form-error", role: "alert" }, "This browser is blocking storage (private windows often do), so nothing you add will be kept. Open the page in a normal window."));
  }

  return h(
    "main",
    { class: "auth" },
    h(
      "section",
      { class: "auth-aside" },
      h("p", { class: "brand" }, brandMark(32), "Site Board"),
      h(
        "div",
        { class: "auth-hero" },
        h("h1", null, "Keep the district website moving."),
        h("p", null, "One board for page updates, broken links, accessibility fixes and layout work."),
        h(
          "ul",
          { class: "auth-points" },
          h("li", null, "Priorities, due dates, subtasks and comments on every task"),
          h("li", null, "Assign work to either of you, or both"),
          h("li", null, "Drag cards between columns, or use the menu on each card"),
        ),
        ...notes,
      ),
    ),
    h("section", { class: "auth-main" }, h("div", { class: "auth-form" }, form)),
  );
}
