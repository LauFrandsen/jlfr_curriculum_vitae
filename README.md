# laufrandsen.dk

Jonas Biune Frandsen's CV: a static page (plain HTML, CSS and JavaScript, no build step) on cream paper, with a WebGL orb of small ink squares, each with a soft burn around it.

## Run locally

```bash
node .claude/serve.mjs 8080
```

Then open http://localhost:8080. Add `?tune` (http://localhost:8080/?tune) for a live slider panel; its "Copy values" button copies the settings so they can be pasted into `CONFIG` in `orb.js`.

## Files

- `index.html`: all CV content. Each experience/project entry with `data-drop` sends dots into the orb when it scrolls into view: in ink, or in the entry's `--dot` colour if one is set (e.g. `style="--dot: #8a3b1e"`).
- `style.css`: colour tokens (paper, ink, burn) at the top, layout, phone breakpoints and the print/PDF version. `.orb-rest` sets where the orb rests once scrolled: beside the text from 1100px, and below that on the bottom edge as a "horizon", with the text fading into the paper (`.paper-fade`) just above it.
- `orb.js`: the orb (WebGL). All tunable values are in `CONFIG` at the top.
- `page.js`: section reveals, entry dots, project panes, PDF button.
- `tune.js`: the `?tune` panel.

## Future work: make the orb feel interactive on phones

On phones the orb looks right but is mostly something you watch, not something you play with. That needs research into how other sites keep large visual elements feeling interactive on touch screens.

Why it's limited today:

- There is no hover on touch screens, so the pointer pull (dots drawn toward the cursor) only happens while a finger is down.
- A swipe that starts on the orb has to scroll the page (`touch-action: pan-y`), so dragging across the orb scrolls instead of playing with it.
- Once scrolled, the orb rests on the bottom edge as a horizon. It sits above the text there but lets touches through (`pointer-events: none`), so the page stays usable; it can't be touched either.

Research: look at how sites with large hero visuals, 3D scenes or canvas animations handle this on phones, and what makes them feel responsive. Ideas to evaluate:

- Tap-and-hold on the orb to "grab" it (and stop the page from scrolling while held), with a visible cue that it can be held.
- Scroll itself as the interaction: the orb reacting to scroll speed and direction.
- Tilting the phone (device orientation) to move or light the orb. iOS asks for permission first, so it needs a clear, optional trigger.
- Short haptic feedback on taps where supported (not available on iOS Safari).
- A dedicated, clearly interactive area in the hero, separate from the scroll gesture.
- Larger, more forgiving touch targets and effects sized for fingers rather than a cursor.

## Publishing

`gh-pages` is the live branch (custom domain in `CNAME`). Work happens on `light` (the ink-on-paper design) and gets merged into `gh-pages` when it is ready. The earlier dark, blue-dot version is kept on `orb`.
