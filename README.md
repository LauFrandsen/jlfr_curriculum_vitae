# laufrandsen.dk

Jonas Biune Frandsen's CV: a static page (plain HTML, CSS and JavaScript, no build step) on cream paper, with a WebGL graphic made of small ink squares, each with a soft burn around it. Each visit starts on one of the graphics at random, the orb or the flower, and every 3 minutes the squares rearrange themselves into the next one.

## Run locally

```bash
node .claude/serve.mjs 8080
```

Then open http://localhost:8080. Add `?graphic=orb` or `?graphic=flower` to start on a graphic, and `?tune` for a live slider panel (e.g. http://localhost:8080/?graphic=flower&tune). The panel's "Next graphic" button morphs into the next graphic without waiting, and "Copy values" copies the settings so they can be pasted into `CONFIG` in that graphic's file in `graphics/`.

## Files

- `index.html`: all CV content. Each experience/project entry with `data-drop` sends squares into the graphic when it scrolls into view: in ink, or in the entry's `--dot` colour if one is set (e.g. `style="--dot: #8a3b1e"`).
- `style.css`: colour tokens (paper, ink, burn) at the top, layout, phone breakpoints and the print/PDF version. `.voxel-rest` sets where the graphic rests once scrolled: beside the text from 1100px, and below that on the bottom edge as a "horizon", with the text fading into the paper (`.paper-fade`) just above it. `html[data-graphic="…"]` rules place a graphic its own way.
- `voxel.js`: the engine every graphic shares (WebGL). It draws the squares and their burn, glides the graphic with the page (hero, rest, horizon, beside a project pane), drops the CV entries' squares in, handles the pointer, presses and adaptive quality, and morphs from one graphic into the next.
- `graphics/orb.js`: the orb. A breathing shell of squares with more flowing in from the screen edges, rippling the surface where they land.
- `graphics/flower.js`: the flower. It grows once out of a strip of soil, every square coming in from the side of the screen, through the soil and up the stem. It then stays mostly whole: now and then a petal (at most two) breaks away and a new one grows back.
- `page.js`: picks the first graphic and the rotation (`GRAPHICS`, `ROTATE_SECONDS`); section reveals, entry squares, project panes, PDF button.
- `tune.js`: the `?tune` panel, with each graphic's own sliders and buttons plus shared ones.

## Adding a graphic

Add `graphics/<name>.js`, whose default export describes the graphic (see the comment at the top of `voxel.js`): its `CONFIG`, its squares (`build()`), its vertex shader (which ends by calling the shared `emit()`), a `frame()` that sets its uniforms, and a `pose()` that says where its visible squares are, which is what the morph flies squares from and to. If it builds up over time, give it a `settle()` that puts it in its finished state, so it appears whole when it's morphed into. Then add its name to `GRAPHICS` in `page.js`, and it joins the rotation. Keep the story squares (CV entries) at the front of its data, and shuffle the rest, so drawing only part of it on a slow device still looks whole.

The morph pairs squares by position (bottom to top, then left to right), so each part of one graphic flows into the part of the next that sits in the same place. Squares one graphic has more of come in from, or leave to, the side of the screen.

## Future work: make the graphics feel interactive on phones

On phones the graphics look right but are mostly something you watch, not something you play with. That needs research into how other sites keep large visual elements feeling interactive on touch screens.

Why it's limited today:

- There is no hover on touch screens, so the pointer pull (squares drawn toward the cursor) only happens while a finger is down.
- A swipe that starts on the graphic has to scroll the page (`touch-action: pan-y`), so dragging across it scrolls instead of playing with it.
- Once scrolled, the graphic rests on the bottom edge as a horizon. It sits above the text there but lets touches through (`pointer-events: none`), so the page stays usable; it can't be touched either.

Research: look at how sites with large hero visuals, 3D scenes or canvas animations handle this on phones, and what makes them feel responsive. Ideas to evaluate:

- Tap-and-hold on the graphic to "grab" it (and stop the page from scrolling while held), with a visible cue that it can be held.
- Scroll itself as the interaction: the graphic reacting to scroll speed and direction.
- Tilting the phone (device orientation) to move or light the graphic. iOS asks for permission first, so it needs a clear, optional trigger.
- Short haptic feedback on taps where supported (not available on iOS Safari).
- A dedicated, clearly interactive area in the hero, separate from the scroll gesture.
- Larger, more forgiving touch targets and effects sized for fingers rather than a cursor.

## Publishing

`gh-pages` is the live branch (custom domain in `CNAME`). GitHub Pages builds it with its standard Jekyll build, which copies the site as-is (`_config.yml` only keeps the notes unpublished). Work happens on `light` (the ink-on-paper design) and gets merged into `gh-pages` when it is ready:

```bash
git switch gh-pages && git merge light && git push && git switch light
```

The earlier dark, blue-dot version is kept on `orb`, and the old Jekyll CV lives on in `gh-pages`' history. Its `projects.html` URL now redirects to `/#projects`. A planned move to `biunefrandsen.dk` is described in `DOMAIN-MIGRATION.md`.
