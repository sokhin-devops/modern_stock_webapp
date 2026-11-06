// Dependency audit for the pipeline (doc/plain/DevSecOps.md section 7). Fails on any high or critical advisory in the
// runtime packages, except the ones accepted in ../audit-allowlist.json, each with the reason it doesn't affect us.
// A new advisory still fails the run, and it fails too when npm audit can't answer.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const accepted = JSON.parse(readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8'));
let report;
try {
  report = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (e) {
  report = e.stdout; // npm audit exits with 1 when it finds anything
}

const found = new Map();
for (const v of Object.values(JSON.parse(report).vulnerabilities ?? {})) {
  for (const a of v.via) {
    if (typeof a === 'object' && (a.severity === 'high' || a.severity === 'critical')) {
      found.set(a.url.split('/').pop(), `${a.severity} ${a.name}: ${a.title}`);
    }
  }
}

const isAccepted = (id) => accepted.some((a) => a.id === id);
for (const [id, text] of found) console.log(`${isAccepted(id) ? 'accepted' : 'NEW     '} ${id} ${text}`);
for (const a of accepted.filter((a) => !found.has(a.id))) console.log(`fixed, remove from the allowlist: ${a.id}`);

const fresh = [...found.keys()].filter((id) => !isAccepted(id));
if (fresh.length) {
  console.error(`\n${fresh.length} new high or critical advisories: update the package, or accept each one in .github/audit-allowlist.json with the reason it doesn't affect us`);
  process.exit(1);
}
