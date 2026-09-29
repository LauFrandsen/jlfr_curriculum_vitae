# laufrandsen.dk

Jonas Biune Frandsen's CV: a static page (plain HTML, CSS and JavaScript, no build step) with a WebGL orb of glowing dots.

## Run locally

```bash
node .claude/serve.mjs 8080
```

Then open http://localhost:8080. Add `?tune` (http://localhost:8080/?tune) for a live slider panel; its "Copy values" button copies the settings so they can be pasted into `CONFIG` in `orb.js`.

## Files

- `index.html`: all CV content. Each experience/project entry with `data-drop` sends dots into the orb in its `--dot` colour when it scrolls into view.
- `style.css`: layout, phone breakpoints and the print/PDF version.
- `orb.js`: the orb (WebGL). All tunable values are in `CONFIG` at the top.
- `page.js`: section reveals, entry dots, project panes, PDF button.
- `tune.js`: the `?tune` panel.

## Publishing

`gh-pages` is the live branch (custom domain in `CNAME`). This work lives on `orb` and gets merged into `gh-pages` when it is ready.
