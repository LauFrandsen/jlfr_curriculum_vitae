// node tools/version.mjs — sets the site's version in index.html (every "?v=..." there) to a short
// hash of the files it loads, so each publish's files are fetched fresh and never mixed with cached
// ones from the publish before. Run before publishing; it only changes index.html when a file changed.
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
