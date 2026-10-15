#!/usr/bin/env node
// Static check of a React Native for Vega app that plays client-side video ads.
// Usage: node audit.mjs <app-dir> [--json]
// No dependencies. Exit code: 0 = no FAIL findings, 1 = at least one FAIL, 2 = usage error.
// It only sees files. Media controls, surfaces and tracking still need a device check.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const root = args.find((a) => !a.startsWith('--'));
if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  console.error('usage: node audit.mjs <app-dir> [--json]');
  process.exit(2);
}

const SKIP_DIRS = new Set([
  'node_modules', 'build', 'dist', 'coverage', 'android', 'ios',
  'test', 'tests', '__tests__', '__mocks__', 'e2e', 'externs', 'vendor', 'third_party',
]);
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const DATA_EXT = /\.(json|xml)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (st.size < 2_000_000) out.push(path);
  }
  return out;
}

const files = walk(root);
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(root, p) || basename(p);
const manifests = files.filter((p) => basename(p) === 'manifest.toml');
const packages = files.filter((p) => basename(p) === 'package.json');
const sources = files.filter((p) => SOURCE_EXT.test(p) && !/\.(test|spec)\.[jt]sx?$/.test(p));
const data = files.filter((p) => DATA_EXT.test(p) && basename(p) !== 'package.json' && !basename(p).endsWith('lock.json'));

const deps = new Set();
for (const p of packages) {
  try {
    const pkg = JSON.parse(read(p));
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
      Object.keys(pkg[key] ?? {}).forEach((d) => deps.add(d));
    }
  } catch {
    // ignore unreadable package.json
  }
}

const src = sources.map((p) => ({ path: p, text: read(p) }));
const anySrc = (re) => src.filter((f) => re.test(f.text));
const findings = [];
const add = (level, id, message, where = []) => findings.push({ level, id, message, where: where.map(rel) });

const isVega = deps.has('@amazon-devices/react-native-kepler') || manifests.length > 0;
if (!isVega) {
  const msg = 'No @amazon-devices/react-native-kepler dependency and no manifest.toml: not a Vega app, nothing checked.';
  if (json) console.log(JSON.stringify({ vega: false, findings: [] }));
  else console.log(msg);
  process.exit(0);
}

const usesW3c = deps.has('@amazon-devices/react-native-w3cmedia') || anySrc(/@amazon-devices\/react-native-w3cmedia/).length > 0;
const usesLibrary = deps.has('react-native-vega-ads') || anySrc(/from ['"]react-native-vega-ads['"]/).length > 0;
const vastFiles = anySrc(/@dailymotion\/(vast-client|vmap)|\bnew\s+(VASTClient|VASTParser|VASTTracker)\b/);
const adCode = usesLibrary || vastFiles.length > 0 || anySrc(/\b(adTagUrl|vastUrl|vmapUrl|adBreak|preroll|pre-roll|midroll|mid-roll)\b/i).length > 0;

const manifestText = manifests.map(read).join('\n');

// M1, M2: media controls manifest entries (both are needed; see media-controls.md).
if (usesW3c && manifests.length > 0) {
  if (!/com\.amazon\.category\.kepler\.media/.test(manifestText)) {
    add('FAIL', 'M1', 'manifest.toml has no "com.amazon.category.kepler.media" category: remote and Alexa play/pause will not reach the players.', manifests);
  }
  if (!/com\.amazon\.kepler\.media\.IMediaPlaybackServer/.test(manifestText)) {
    add('FAIL', 'M2', 'manifest.toml has no interface.provider extra with "com.amazon.kepler.media.IMediaPlaybackServer": media controls commands are not delivered.', manifests);
  }
}

// M3: advertising ID service.
const adIdFiles = anySrc(/@amazon-devices\/kepler-adid-retriever/);
if ((adIdFiles.length > 0 || deps.has('@amazon-devices/kepler-adid-retriever')) && !/com\.amazon\.admanager\.service\.main/.test(manifestText)) {
  add('FAIL', 'M3', 'The Advertising ID retriever is used but manifest.toml does not want "com.amazon.admanager.service.main": the ID service reports "do not track" for every user.', [...adIdFiles.map((f) => f.path), ...manifests]);
}

// M4: plain http:// media not covered by the cleartext policy.
const cleartext = (() => {
  const m = manifestText.match(/\[network-traffic-policy\.cleartext\][^[]*?allowed-domains\s*=\s*\[([^\]]*)\]/s);
  return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1].toLowerCase()) : [];
})();
const httpMedia = new Map();
for (const p of [...sources, ...data]) {
  for (const m of read(p).matchAll(/http:\/\/([^/\s'"<>:]+)(?::\d+)?\/[^\s'"<>]*\.(mp4|m4v|mov|webm|m3u8|mpd)\b/gi)) {
    const host = m[1].toLowerCase();
    if (!cleartext.includes(host)) {
      if (!httpMedia.has(host)) httpMedia.set(host, new Set());
      httpMedia.get(host).add(p);
    }
  }
}
for (const [host, where] of httpMedia) {
  add('FAIL', 'M4', `Plain http:// media on "${host}" without that host in [network-traffic-policy.cleartext] allowed-domains: w3cmedia refuses it ("Invalid or insecure URI scheme"). Use HTTPS.`, [...where]);
}
if (cleartext.length > 0) {
  add('CHECK', 'M5', `Cleartext allowed for ${cleartext.join(', ')}. Keep development hosts out of release builds.`, manifests);
}

// S1: media controls focus is never moved between players.
const twoSurfaces = src.reduce((n, f) => n + (f.text.match(/<KeplerVideoSurfaceView\b/g) ?? []).length, 0) >= 2;
if (usesW3c && adCode && !usesLibrary && (vastFiles.length > 0 || twoSurfaces) && anySrc(/\bsetMediaControlFocus\s*\(/).length === 0) {
  add('FAIL', 'S1', 'Ad code with w3cmedia but no setMediaControlFocus call: give focus to the ad player at ad start and back to the content player after the break.');
}

// S2: deprecated component instance hook.
const deprecated = anySrc(/\buseComponentInstance\s*\(/);
if (deprecated.length > 0) {
  add('CHECK', 'S2', 'useComponentInstance() is deprecated; use useKeplerAppStateManager().getComponentInstance().', deprecated.map((f) => f.path));
}

// S3: VAST/VMAP library without a tracking transport (Vega has no Image).
if (vastFiles.length > 0 && !usesLibrary && anySrc(/\.\s*Image\s*=(?!=)|\bImage\s*:\s*class\b|installImagePolyfill/).length === 0) {
  add('FAIL', 'S3', 'VAST/VMAP code found but no Image shim or own pixel sender: Vega has window but no Image, so browser-style tracking pixels throw or are not sent.', vastFiles.map((f) => f.path));
}

// S4: XML parser.
if (vastFiles.length > 0 && !usesLibrary && !deps.has('@xmldom/xmldom') && !deps.has('fast-xml-parser')) {
  add('CHECK', 'S4', 'VAST/VMAP code found but no pure-JS XML parser dependency (@xmldom/xmldom or fast-xml-parser): Vega has no DOMParser.', vastFiles.map((f) => f.path));
}

// S5: own play/pause key handling next to media controls.
const playpause = anySrc(/useTVEventHandler[\s\S]{0,800}['"]playpause['"]/);
if (playpause.length > 0 && adCode) {
  add('CHECK', 'S5', "A useTVEventHandler handles 'playpause'. The key also reaches media controls: ignore it there while an ad plays, or the ad toggles twice.", playpause.map((f) => f.path));
}

// S6: setMediaControlFocus right after play() (blocks the JS thread on a cold launch).
const eager = src.filter((f) => /\.play\s*\([^)]*\)\s*;?[^\n]*\n(?:[^\n]*\n){0,2}[^\n]*setMediaControlFocus\s*\(/.test(f.text));
if (eager.length > 0) {
  add('CHECK', 'S6', 'setMediaControlFocus is called right after play(). On a cold launch it blocked the JS thread for 1-2 s; call it after the first frame (from the playing handler, deferred).', eager.map((f) => f.path));
}

if (json) {
  console.log(JSON.stringify({ vega: true, usesW3c, usesLibrary, adCode, findings }, null, 2));
} else {
  console.log(`vega-client-side-ads audit: ${rel(root)} (w3cmedia: ${usesW3c ? 'yes' : 'no'}, ad code: ${adCode ? 'yes' : 'no'}, react-native-vega-ads: ${usesLibrary ? 'yes' : 'no'})`);
  if (findings.length === 0) console.log('No findings. This does not prove the ads work: check them on a device.');
  for (const f of findings) {
    console.log(`\n[${f.level}] ${f.id} ${f.message}`);
    for (const w of f.where) console.log(`  - ${w}`);
  }
}
process.exit(findings.some((f) => f.level === 'FAIL') ? 1 : 0);
