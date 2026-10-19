// node tools/llms.mjs — writes llms-full.txt, the CV as plain markdown for AI agents (see llms.txt), from
// the CV in index.html, so the two never drift apart. tools/version.mjs runs it too, on every publish.
//
// It reads the page with a small HTML reader of its own (the page is plain, hand-written HTML) and
// writes what a person reading the CV sees: the parts of <main class="cv"> as sections (named by their
// heading, or their data-tour-title), each role or project as a heading with its place and dates,
// lists as lists, a row of tags as one line, links as markdown links. What's hidden, print-only or
// only decoration (the tour's own introduction, the timeline's markers, the PDF button) is left out.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const SITE = 'https://laufrandsen.dk/';

// ---------- reading the HTML ----------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m);

// A tree of { tag, attrs, children } and { text } nodes. Scripts and styles are skipped whole.
function parse(html) {
  const top = { tag: '#root', attrs: {}, children: [] }, stack = [top];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {
      stack.at(-1).children.push({ text: m[5] });
      continue;
    }
    const [, close, name, attrText, selfClosing] = m, tag = name.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = {};
    attrText.replace(/([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g, (_, k, v) => {
      attrs[k.toLowerCase()] = v ? decode(v.replace(/^["']|["']$/g, '')) : '';
    });
    const el = { tag, attrs, children: [] };
    stack.at(-1).children.push(el);
    if (tag === 'script' || tag === 'style') {
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1;
    } else if (!VOID.has(tag) && !selfClosing) {
      stack.push(el);
    }
  }
  return top;
}

const classes = (el) => (el.attrs?.class ?? '').split(/\s+/);
const is = (el, c) => classes(el).includes(c);
const elements = (el) => el.children.filter((c) => c.tag);
function find(el, test) {
  for (const c of elements(el)) {
    if (test(c)) return c;
    const deeper = find(c, test);
    if (deeper) return deeper;
  }
  return null;
}

// Left out: what's hidden, print-only or only decoration, and the page's own buttons (but a project's
// name, which is a button that opens its pane, stays).
const skipped = (el) => 'hidden' in el.attrs || el.attrs['aria-hidden'] === 'true' || is(el, 'print-only')
  || ['svg', 'script', 'style', 'dialog', 'canvas'].includes(el.tag) || (el.tag === 'button' && !is(el, 'project-open'));

const squash = (s) => s.replace(/\s+/g, ' ').trim();

// An element's text, as one line: plain, or with its links as markdown links.
function text(el, links = true) {
  if (el.text !== undefined) return decode(el.text);
  if (skipped(el)) return '';
  const inner = el.children.map((c) => text(c, links)).join('');
  const href = el.attrs.href;
  if (links && el.tag === 'a' && href && !href.startsWith('#')) {
    const t = squash(inner);
    return t ? `[${t}](${href})` : '';
  }
  return inner;
}
const line = (el, links) => squash(text(el, links));

// ---------- writing the markdown ----------

const BLOCKS = new Set(['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'div', 'article', 'section']);

// A row of tags: one line, tags of the same data-category gathered with it ("Linux, Windows, macOS
// (operating systems)").
function tags(ul) {
  const groups = [];
  for (const li of elements(ul).filter((c) => c.tag === 'li' && !skipped(c))) {
    const name = line(li, false), cat = li.attrs['data-category'] ?? '';
    if (groups.length && groups.at(-1).cat === cat) groups.at(-1).names.push(name);
    else groups.push({ cat, names: [name] });
  }
  return groups.map((g) => g.names.join(', ') + (g.cat ? ` (${g.cat.toLowerCase()})` : '')).join('; ');
}

// The blocks of a part of the page, as markdown (a list's lines are one block).
function blocks(el, out = []) {
  const kids = elements(el).filter((c) => !skipped(c));
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c.tag === 'h1') continue;   // (the CV's name heads the whole file)
    if (c.tag === 'h2') out.push(`## ${line(c, false)}`);
    else if (c.tag === 'h3') {
      // A role or a project: its place and dates (the meta line after it) go with its name.
      const meta = kids[i + 1] && is(kids[i + 1], 'tl-meta') ? kids[++i] : null;
      out.push(`### ${line(c, false)}${meta ? `: ${line(meta, false)}` : ''}`);
    } else if (is(c, 'skill-group')) {
      const name = find(c, (x) => x.tag === 'h3'), row = find(c, (x) => is(x, 'chips')), note = find(c, (x) => is(x, 'note'));
      out.push(`- ${line(name, false)}: ${tags(row)}.${note ? ` ${line(note)}` : ''}`);
      continue;
    } else if (is(c, 'chips')) {
      const label = c.attrs['aria-label'];
      out.push(`${label ? `${label}: ` : ''}${tags(c)}.`);
    } else if (is(c, 'languages')) {
      out.push(elements(c).map((li) => `- ${line(find(li, (x) => x.tag === 'strong'), false)}: ${line(find(li, (x) => x.tag === 'span'), false).toLowerCase()}`).join('\n'));
    } else if (c.tag === 'ul' || c.tag === 'ol') {
      const items = elements(c).filter((li) => li.tag === 'li' && !skipped(li));
      // A list of entries (the timeline): each entry's own blocks; otherwise a plain list.
      if (items.some((li) => elements(li).some((x) => BLOCKS.has(x.tag)))) items.forEach((li) => blocks(li, out));
      else out.push(items.map((li) => `- ${line(li)}`).join('\n'));
    } else if (c.tag === 'p') {
      const t = line(c);
      if (t) out.push(t);
    } else if (c.tag === 'section' || c.tag === 'footer') {
      // A part of the CV: named by its heading, or (without one) its data-tour-title.
      if (!elements(c).some((x) => x.tag === 'h2') && c.attrs['data-tour-title']) out.push(`## ${c.attrs['data-tour-title']}`);
      blocks(c, out);
    } else {
      blocks(c, out);
    }
  }
  return out;
}

export function llmsFull(html) {
  const page = parse(html);
  const main = find(page, (el) => el.tag === 'main' && is(el, 'cv'));
  if (!main) throw new Error('index.html has no <main class="cv">');
  const name = line(find(main, (el) => el.tag === 'h1'), false);
  const description = find(page, (el) => el.tag === 'meta' && el.attrs.name === 'description')?.attrs.content ?? '';
  const updated = line(find(main, (el) => is(el, 'updated')) ?? { text: '' }, false);
  const head = [
    `# ${name}: CV`,
    description && `> ${description}`,
    `The CV at ${SITE}, as plain markdown, made from the page itself.${updated ? ` ${updated}.` : ''}`,
  ].filter(Boolean);
  // (The footer's last line, the date, is already said above.) List items next to each other (the
  // skill groups') make one list.
  const body = [];
  for (const b of blocks(main).filter((x) => x !== updated)) {
    if (b.startsWith('- ') && body.at(-1)?.startsWith('- ')) body[body.length - 1] += `
${b}`;
    else body.push(b);
  }
  return `${head.concat(body).join('\n\n')}\n`;
}

// Writes llms-full.txt; returns whether it changed.
export function writeLlmsFull() {
  const out = llmsFull(readFileSync(join(root, 'index.html'), 'utf8'));
  const path = join(root, 'llms-full.txt');
  let before = '';
  try { before = readFileSync(path, 'utf8'); } catch { /* not there yet */ }
  if (before.replace(/\r\n/g, '\n') === out) return false;
  writeFileSync(path, out);
  return true;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('llms.mjs')) {
  console.log(writeLlmsFull() ? 'llms-full.txt written' : 'llms-full.txt (unchanged)');
}
