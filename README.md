# Site Board

A task board for two people maintaining a school district website. This folder is the complete website: plain HTML, CSS and JavaScript with **no build step and no backend**, ready for GitHub Pages.

## Important: where your data lives

There is no server and no sign-in. Everything you enter is saved **in the browser, on the device you are using** (browser localStorage).

* Tasks are **not shared** between you and your teammate, or between your own devices. Each browser has its own board.
* Clearing site data, using a private window, or switching browsers shows an empty board.
* Use **Team → Download backup** regularly. **Restore from backup** loads a backup into any browser, which is also how you move a board to another device.
* Two people can share one computer: add both names under **Team** and switch between them from the name menu (top right). Comments and history record who made each change.

## Publish it

1. Upload the contents of this folder to a GitHub repository, so `index.html` sits at the top level of the repo.
2. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the site is live at `https://YOUR-NAME.github.io/YOUR-REPO/`.

Nothing needs configuring: all file paths are relative, and there are no keys or settings in this folder.

## First use

Open the site and enter your name (and optionally your teammate's name and a board name). The board starts empty; assignment options come only from the people you add. Add more people, rename them, or restore a backup from **Team**.

## Try it on your own computer first

The site uses JavaScript modules, which browsers will not load from a double-clicked file. Serve the folder instead, for example:

```
npx http-server -p 8080
```

then open http://localhost:8080.

## What is in here

* `index.html`, `css/`, `js/` the app (`js/store.js` holds the saving logic)
* `assets/fonts/` self-hosted Manrope and Bricolage Grotesque (SIL Open Font License, licenses included)
* `.nojekyll` tells GitHub Pages to serve the files as they are

The page is marked `noindex`. Because there is no server, the public address exposes no task data: a visitor only ever sees the board stored in their own browser.
