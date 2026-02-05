# CV Project Documentation

## Overview

A minimal Jekyll-based CV/resume that renders beautifully both on the web and when printed to PDF. Uses pure CSS (no JavaScript) with separate stylesheets for screen and print media.

## Project Structure

```
jlfr_curriculum_vitae/
├── _config.yml           # Jekyll config (markdown engine, theme selection)
├── _layouts/cv.html      # Main HTML template
├── index.md              # CV content in Markdown with YAML frontmatter
├── media/                # CSS stylesheets
│   ├── kjhealy-screen.css   # Default theme - web view
│   ├── kjhealy-print.css    # Default theme - print view
│   ├── davewhipp-screen.css # Alternate theme - web view
│   └── davewhipp-print.css  # Alternate theme - print view
├── README.md             # User-facing documentation
└── LICENSE               # MIT License
```

## How It Works

### Theme System
- `_config.yml` sets `style: kjhealy` (or `davewhipp`)
- Layout template dynamically loads `media/{{ site.style }}-screen.css` and `-print.css`
- Browser applies correct stylesheet based on media type

### Two-Column Layout
- Dates/codes wrapped in backticks (`) appear in left column
- Main content appears in right column (33% margin on screen, 28% on print)
- Achieved via CSS positioning, not flexbox/grid

### Markdown Conventions
- `# Name` - Main heading (your name)
- `## Section` - Section headers (Education, Experience, etc.)
- `### Subsection` - Category headers within sections
- `` `1999-2005` `` - Date ranges (rendered in left column)
- `__Bold__` or `**Bold**` - Institution/company names
- `*Italic*` - Publication titles, awards
- `<div id="webaddress">` - Contact info block

## Development

```bash
# Install Jekyll
gem install bundler jekyll

# Run locally
jekyll serve
# Visit http://localhost:4000

# Generate PDF
# Open in browser, press Ctrl+P / Cmd+P, "Save as PDF"
```

## CSS Architecture

Both themes include:
1. Meyer Reset v2.0 (lines 1-48)
2. Body typography and margins
3. Two-column positioning for p, ul, h1-h4
4. Code styling for date labels
5. Link and emphasis styles
6. Hidden elements (#address, #ghbutton)

### Key Differences: Screen vs Print
| Property | Screen | Print |
|----------|--------|-------|
| Font size | 80% | 10pt |
| Left margin | 33% | 28% |
| Line height | 1.5em | 1.35em |
| Code color | #aaa | #ccc |
| Link underlines | on hover | none |

## Known Issues / Cleanup Needed

1. **Typo in index.md**: "Isaac Newtons's CV" (extra 's')
2. **Inconsistent selectors**: Screen CSS hides `#address`, print CSS hides `#ghbutton`
3. **Duplicated CSS reset**: Same ~50 lines repeated in all 4 CSS files
4. **No viewport meta**: Layout not responsive on mobile
5. **Missing charset in config**: Should specify UTF-8 encoding
6. **Trailing whitespace**: Extra blank lines at end of index.md

## Improvement Ideas

### Print/PDF Enhancements
- Add page break controls (`page-break-before`, `page-break-inside`)
- Improve date alignment consistency
- Add proper PDF metadata (title, author)
- Consider A4 vs Letter sizing

### Web Interactivity
- Add dark mode toggle
- Smooth scroll navigation
- Collapsible sections
- Skills visualization (progress bars, tags)
- Timeline view for experience
- Mobile responsive breakpoints
- Print button with preview

### Code Quality
- Extract CSS reset to shared file
- Convert to SASS for variables/mixins
- Add CSS custom properties for theming
- Minify CSS for production
