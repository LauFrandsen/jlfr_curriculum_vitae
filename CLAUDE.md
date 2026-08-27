# Jonas Biune Frandsen's CV - Project Documentation

## Overview

A Jekyll-based CV/resume featuring an interactive particles.js background animation for the web view, with a clean print-optimized layout for PDF generation. The two-column design places dates on the left and content on the right.

## Project Structure

```
jlfr_curriculum_vitae/
├── _config.yml              # Jekyll config (markdown engine, theme)
├── _layouts/cv.html         # Main HTML template with particles.js integration
├── index.md                 # CV content in Markdown
├── media/                   # CSS stylesheets
│   ├── kjhealy-screen.css   # Web view styles (active)
│   ├── kjhealy-print.css    # Print/PDF styles (active)
│   ├── davewhipp-*.css      # Alternate theme (unused)
├── js/
│   ├── particles.js         # Particles library (local copy)
│   └── particles_config.js  # Particle animation configuration
├── README.md
└── LICENSE
```

## Architecture

### Theme System
- `style: kjhealy` in `_config.yml` selects the active theme
- Layout loads `media/{style}-screen.css` for web and `media/{style}-print.css` for printing
- Browser automatically applies correct stylesheet via CSS media queries

### Two-Column Layout
- Dates wrapped in backticks (`` `2023-Now` ``) render in the left column
- Content flows in the right column (33% margin on screen, 25% on print)
- Section headers (h2) right-aligned in left column, colored red (#a00)

### Particles.js Integration
- CDN script in `<head>`, config loaded at end of `<body>`
- Fixed position canvas behind content (`z-index: 0`)
- Content has semi-transparent gradient background for readability
- Interactive: particles repulse on hover, new particles on click
- Hidden in print via `display: none !important`

### Print vs Screen
| Feature | Screen | Print |
|---------|--------|-------|
| Particles | Visible, interactive | Hidden |
| Font size | 80% | 70% |
| Layout | Position-based | Float-based |
| `.print-only` | Hidden | Visible |
| Footer | Visible | Hidden |
| Date codes | Gray (#aaa) | Black |

### Mobile Responsiveness
- Breakpoint at 768px: Single column, static positioning
- Breakpoint at 480px: Further padding/margin adjustments
- Particles fade to 30% opacity on mobile
- Text gets white shadow for readability

## Markdown Conventions

```markdown
# Name                          → Main heading
## Section                      → Red section headers (Education, Skills)
### Subsection                  → Sub-categories (Languages)
`2023-Now`                      → Date range in left column
__Company Name__                → Bold institution/company
*Role Title*                    → Italic role/position
- Bullet point                  → List item
<div class="print-only">        → Content only visible when printing
```

## Development

```bash
# Install Jekyll
gem install bundler jekyll

# Run locally
jekyll serve
# Visit http://localhost:4000

# Generate PDF
# Open in browser → Ctrl+P/Cmd+P → Save as PDF
```

## Current Issues

1. **Duplicated CSS**: Particles and container styles in both layout HTML and screen CSS
2. **Trailing whitespace**: Empty lines at end of index.md
3. **Typo**: "succesfull" → "successful" in Personal Skills section
4. **Inconsistent config formatting**: Mixed spacing around colons in _config.yml
5. **Unused theme files**: davewhipp-*.css files not used but still present

## Improvement Ideas

### Print/PDF Enhancements
- Better page break control for multi-page CVs
- Consistent date alignment across sections
- Optimized margins for A4/Letter paper
- PDF metadata (title, author) via `<meta>` tags

### Web Interactivity
- Dark mode toggle with particle color inversion
- Smooth scroll navigation between sections
- Collapsible sections for long content
- Skills visualization (progress bars, tag clouds)
- Timeline component for experience
- Print preview button

### Code Quality
- Extract shared CSS reset to separate file
- Convert to SASS for variables and mixins
- Remove duplicate styles between layout and CSS
- CSS custom properties for theming
- Minification for production
