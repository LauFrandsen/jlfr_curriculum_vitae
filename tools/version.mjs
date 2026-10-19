// node tools/version.mjs — sets the site's version in index.html (every "?v=..." there) to a short
// hash of the files it loads, so each publish's files are fetched fresh and never mixed with cached
// ones from the publish before. Run before publishing; it only changes index.html when a file changed.
// It also warns if the CV's text has changed since llms-full.txt (the CV for AI agents) was checked.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const files = ['style.css', 'page.js', 'voxel.js', 'tune.js', 'sound.js', 'callouts.js', 'tour.js',
  ...readdirSync(join(root, 'graphics')).filter((f) => f.endsWith('.js')).sort().map((f) => `graphics/${f}`)];
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);

const indexPath = join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const stamped = html.replace(/\?v=[0-9a-z]+/g, `?v=${version}`);
if (stamped !== html) writeFileSync(indexPath, stamped);

// Every graphic needs an entry in the import map, or it would load unversioned.
for (const f of files.filter((f) => f.startsWith('graphics/'))) {
  if (!stamped.includes(`"./${f}": "./${f}?v=`)) console.warn(`index.html's import map has no entry for ./${f}`);
}
console.log(stamped === html ? `version ${version} (unchanged)` : `version ${version}`);

// The CV for AI agents (llms-full.txt, plain markdown) is written by hand from the page: if the CV's
// text has changed since it was last brought up to date, say so. Once it's been updated (or checked),
// `node tools/version.mjs --cv-checked` records the CV as it is now in tools/cv-text.hash.
const cvText = (stamped.split('<main class="cv">')[1] ?? '').split('</main>')[0]
  .replace(/<section id="hello"[\s\S]*?<\/section>/, '')   // (the tour's own introduction isn't in it)
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cvHash = createHash('sha256').update(cvText).digest('hex').slice(0, 10);
const hashPath = join(root, 'tools', 'cv-text.hash');
if (process.argv.includes('--cv-checked')) writeFileSync(hashPath, cvHash + '\n');
let recorded = '';
try { recorded = readFileSync(hashPath, 'utf8').trim(); } catch { /* none yet */ }
if (recorded !== cvHash) {
  console.warn('The CV in index.html has changed since llms-full.txt (the CV for AI agents) was last checked:');
  console.warn('bring llms-full.txt (and llms.txt, if need be) up to date, then run: node tools/version.mjs --cv-checked');
}

