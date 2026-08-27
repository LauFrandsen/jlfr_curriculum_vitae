---
published: false
---

# Domain migration: laufrandsen.dk → biunefrandsen.dk

The CV display name changed from "Jonas Lau Frandsen" to "Jonas Biune Frandsen"
in August 2026. The LinkedIn vanity URL has since moved to
`linkedin.com/in/biunefrandsen`. The domain and email address are still on the
old `laufrandsen.dk` identity.

## Plan

1. Register `biunefrandsen.dk`.
2. Set up a forward from `laufrandsen.dk` so old links and any printed PDFs
   already in circulation keep working.
3. Point DNS for the new domain at GitHub Pages.
4. Only then update the files below — all in one commit.

## Files to change

| File | What changes |
|---|---|
| `CNAME` | the GitHub Pages custom domain — lowercase, one line, no scheme |
| `_config.yml` | the `url:` field |
| `index.md` | `mailto:` link, visible email text, print-only "see webpage" link |
| `projects.md` | `mailto:` link and visible email text |

## Notes

- Do not change these piecemeal. If `CNAME` moves before DNS resolves, the site
  goes down until it catches up.
- Write the domain lowercase in `CNAME`. DNS is case-insensitive, but GitHub
  Pages is fussy about that file's exact contents.
- The repo and folder name `jlfr_curriculum_vitae` is initials only and has no
  effect on the published site — no need to rename it.
