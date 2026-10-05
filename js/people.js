// Team dialog: the people on this board, which one is using it now, and backup / restore of the data.
import { h, dialog, notify, run, errorText, replaceChildren } from "./dom.js";
import * as store from "./store.js";

export function openPeopleDialog({ onClose }) {
  const dlg = dialog({ title: "Team and backup", onClose });
  let lastSig = "";

  function confirmDialog({ title, text, confirmLabel, onConfirm }) {
    const d = dialog({ title });
    d.body.append(
      h("p", null, text),
      h("div", { class: "row end" }, h("button", { type: "button", class: "btn", onClick: () => d.close() }, "Cancel"), h("button", { type: "button", class: "btn btn-danger", onClick: () => (d.close(), onConfirm()) }, confirmLabel)),
    );
  }

  function render() {
    const s = store.getState();
    const sig = JSON.stringify([s.people, s.meId, s.boardName]);
    if (sig === lastSig) return;
    lastSig = sig;

    const people = s.people.map((p) => {
      const input = h("input", { value: p.name, maxlength: "80", "aria-label": `Name of person ${s.people.indexOf(p) + 1}` });
      input.addEventListener("change", () => run("Renaming", async () => store.renamePerson(p.id, input.value)));
      return h(
        "li",
        { class: "person-row" },
        input,
        p.id === s.meId
          ? h("span", { class: "tag" }, "Using the board now")
          : h("button", { type: "button", class: "btn btn-sm", onClick: () => store.switchUser(p.id) }, "Use as me"),
        s.people.length > 1 &&
          h("button", { type: "button", class: "btn btn-sm btn-ghost danger", onClick: () => confirmDialog({ title: `Remove ${p.name}?`, text: "They'll be removed from any tasks they were assigned to. Their past comments and history stay.", confirmLabel: "Remove", onConfirm: () => run("Removing", async () => store.removePerson(p.id)) }) }, "Remove"),
      );
    });

    const addForm =
      s.people.length < 2 &&
      (() => {
        const name = h("input", { id: "add-person", maxlength: "80", required: true });
        return h(
          "form",
          {
            class: "field",
            onSubmit: (e) => {
              e.preventDefault();
              run("Adding", async () => store.addPerson(name.value));
            },
          },
          h("label", { for: "add-person" }, "Add your teammate"),
          h("div", { class: "row" }, name, h("button", { type: "submit", class: "btn btn-primary" }, "Add")),
          h("p", { class: "hint" }, "Once added, tasks can be assigned to them."),
        );
      })();

    const boardName = h("input", { id: "board-name", value: s.boardName, maxlength: "80", placeholder: "Optional" });
    boardName.addEventListener("change", () => run("Renaming", async () => store.renameBoard(boardName.value)));

    const file = h("input", { type: "file", accept: "application/json,.json", class: "sr-only", id: "import-file", tabindex: "-1" });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      file.value = "";
      if (!f) return;
      const text = await f.text();
      confirmDialog({
        title: "Replace this board with the backup?",
        text: "Everything currently on this board will be replaced by the contents of the file.",
        confirmLabel: "Replace",
        onConfirm: async () => {
          try {
            store.importJson(text);
            notify("Backup restored.");
          } catch (err) {
            notify(errorText(err));
          }
        },
      });
    });

    replaceChildren(
      dlg.body,
      h("p", { class: "muted" }, "Everything on this board is saved in this browser, on this device only. It is not shared with other devices or people."),
      h("h3", null, "People"),
      h("ul", { class: "people" }, people),
      addForm,
      h("div", { class: "field" }, h("label", { for: "board-name" }, "Board name"), boardName),
      h("h3", null, "Backup"),
      h("p", { class: "muted" }, "Download a copy to keep it safe or to open this board in another browser."),
      h(
        "div",
        { class: "row wrap" },
        h(
          "button",
          {
            type: "button",
            class: "btn",
            onClick: () => {
              const blob = new Blob([store.exportJson()], { type: "application/json" });
              const a = h("a", { href: URL.createObjectURL(blob), download: `site-board-backup-${new Date().toISOString().slice(0, 10)}.json` });
              document.body.append(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            },
          },
          "Download backup",
        ),
        h("label", { class: "btn", for: "import-file" }, "Restore from backup"),
        file,
        h("button", { type: "button", class: "btn btn-ghost danger", onClick: () => confirmDialog({ title: "Erase everything?", text: "All tasks, comments and people on this device will be deleted. Download a backup first if you might need them.", confirmLabel: "Erase everything", onConfirm: () => (dlg.close(), store.eraseAll()) }) }, "Erase all data"),
      ),
    );
  }

  render();
  return { close: dlg.close, update: render };
}
