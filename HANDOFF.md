# Design Refresh — Handoff Notes

**Branch:** `design-refresh` (off `gh-pages`)
**Status:** Implementation complete, **NOT yet built or visually verified** — no Jekyll on the machine where this was written.
**Last updated:** 2026-06-11

## What this branch does

Full visual redesign of the CV. Direction chosen by Jonas after an inspiration review
(the inspiration book + source material live OUTSIDE this repo, at
`/Users/jlfr/Code/CV/inspiration/` on the original machine — deliberately not committed):

> **Hybrid warm editorial**: Claude/Anthropic-adjacent palette (oat cream `#F0EEE6`,
> crail terracotta `#D97757`, warm-gray ramp) + a 1+3 label/content section grid,
> big-number stats row, and numbered focus blocks. **All-Inter typography with weight
> discipline** (300/400/500, nothing bold, tight negative tracking) + JetBrains Mono.
> Borders not shadows. Particles.js retired. Print stays first-class.

## Files changed on this branch

| File | Change |
|---|---|
| `_config.yml` | `style: kjhealy` → `style: editorial` |
| `_layouts/cv.html` | Rewritten. Was 522 lines (440 of JS DOM-rewriting + particles); now ~75 lines. JS = theme toggle + print button + `beforeprint` expands all `<details>`. Inter/JetBrains Mono via Google Fonts. Dark mode = `.dark` class on `<html>` (was `.dark-mode` on body — localStorage key `theme` unchanged). |
| `media/editorial-screen.css` | NEW — the whole design system. Tokens at top (light + `html.dark`). 1+3 `.section-grid`, `.stats`, `.focus-list`, timeline, tags, terminal contact card, giant footer wordmark. |
| `media/editorial-print.css` | NEW — print as its own design target: A4, black-on-white, no chrome, two-col focus/trait grids, `break-inside` hygiene, terminal card degrades to plain mono contact lines. |
| `index.md` | Restructured to explicit semantic HTML sections (hero with `.dim` device, stats row, numbered focus areas, experience timeline, selected project, skills as tag groups, traits, terminal contact). All Liquid loops over `_data/experience.yml` / `_data/projects.yml` preserved. |
| `projects.md` | Aligned to the same system (hero + project cards). |

**Not deleted (intentionally):** `media/kjhealy-*.css`, `media/davewhipp-*.css`,
`js/particles*.js` — kept for rollback; switch `style:` back in `_config.yml` to restore
the old look. Delete once the redesign is approved.

## Next steps (on a machine with Jekyll)

1. `jekyll serve` → visual pass on http://localhost:4000
   - Check: hero, stats row, 1+3 grids at desktop AND mobile (<768px stacks to single column)
   - Dark mode toggle (top-right pill buttons)
   - `<details>` previous-experience expand/collapse
2. **Print check (the crucial constraint):** Cmd+P on both light and dark mode
   (print CSS forces white/black regardless) — verify page breaks, that all `<details>`
   content prints, and that it fits ~2 pages A4
3. Review stats row wording in `index.md` — current: `3+` yrs / `DK-wide` train
   predictions / `10` yrs D&D. Easy to swap; numbers must stay defensible
4. Possibly thin out `position-details` bullets in `_data/experience.yml` — the new
   design is airier and long bullet lists may read heavy
5. Update `CLAUDE.md` — it documents the OLD architecture (particles, kjhealy, JS
   restructuring); rewrite after design is approved

## Known open questions

- The print stylesheet caps stat labels at 40mm width — verify nothing clips in print preview
- Inspiration material is local-only on the original machine (`/Users/jlfr/Code/CV/inspiration/`);
  ask Claude there if the full design rationale is needed
