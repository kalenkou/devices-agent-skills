#!/usr/bin/env node
// Structural and executable checks for the vega-client-side-ads skill.
// Usage (from the repository root or anywhere): node skills/vega-client-side-ads/evals/check.mjs
// No dependencies. Exit code 1 on the first failed check.

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(skillDir, '..', '..');
const read = (p) => readFileSync(join(skillDir, p), 'utf8');
let passed = 0;
const check = (ok, message) => {
  if (!ok) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  passed += 1;
};

// Frontmatter (Agent Skills specification: name and description).
const skill = read('SKILL.md');
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
check(fm, 'SKILL.md starts with YAML frontmatter');
const name = fm[1].match(/^name:\s*(.+)$/m)?.[1].trim();
const description = fm[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? '';
check(name === basename(skillDir), 'frontmatter name equals the folder name');
check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64, 'name is lowercase words joined by hyphens, at most 64 characters');
check(description.length > 0 && description.length <= 1024, `description has 1-1024 characters (has ${description.length})`);
check(/Not for/.test(description), 'description states what the skill is not for');
check(skill.split('\n').length <= 150, 'SKILL.md has at most 150 lines');

// Every local link resolves, including #anchors to headings.
const slug = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const anchorsOf = (text) => new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])));
const mdFiles = ['SKILL.md', ...readdirSync(join(skillDir, 'references')).filter((f) => f.endsWith('.md')).map((f) => `references/${f}`),
  ...readdirSync(join(skillDir, 'evals')).filter((f) => f.endsWith('.md')).map((f) => `evals/${f}`)];
for (const file of mdFiles) {
  const text = read(file);
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [path, anchor] = target.split('#');
    const abs = path ? resolve(skillDir, dirname(file), path) : join(skillDir, file);
    check(existsSync(abs), `${file}: link target exists: ${target}`);
    if (anchor) check(anchorsOf(readFileSync(abs, 'utf8')).has(anchor), `${file}: anchor exists: ${target}`);
  }
}

// Eval fixtures.
const triggers = read('evals/TRIGGER_PROMPTS.md');
const [should, shouldNot] = triggers.split('## Should not trigger');
check((should.match(/^\d+\. /gm) ?? []).length >= 10, 'at least 10 should-trigger prompts');
check((shouldNot.match(/^\d+\. /gm) ?? []).length >= 10, 'at least 10 should-not-trigger prompts');
const scenarios = read('evals/TASK_SCENARIOS.md');
check((scenarios.match(/^## S\d+\./gm) ?? []).length >= 6, 'at least 6 task scenarios');
check((scenarios.match(/^- A\d+\. /gm) ?? []).length >= 25, 'at least 25 assertions');

// README registration.
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
check(readme.includes(`[${name}](skills/${name}/SKILL.md)`), 'README Available Skills table has a row for the skill');

// The audit script on three small fixture apps.
const audit = join(skillDir, 'references', 'scripts', 'audit.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'vega-csai-check-'));
const app = (dirName, files) => {
  const dir = join(tmp, dirName);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
};
const pkg = (extra = {}) => JSON.stringify({
  dependencies: { '@amazon-devices/react-native-kepler': '*', '@amazon-devices/react-native-w3cmedia': '*', '@dailymotion/vast-client': '*', ...extra },
});
const goodManifest = `
[[components.interactive]]
id = "com.example.app.main"
categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]

[[extras]]
key = "interface.provider"
component-id = "com.example.app.main"

[extras.value.application]
[[extras.value.application.interface]]
interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"
`;
const adSource = `import { VASTClient } from '@dailymotion/vast-client';
export const AD = 'http://cdn.example.com/ad.mp4';
export function onAd(player, instance) { new VASTClient(); player.play(); }
`;
const run = (dir) => {
  const r = spawnSync(process.execPath, [audit, dir, '--json'], { encoding: 'utf8' });
  return { status: r.status, ids: (JSON.parse(r.stdout).findings ?? []).map((f) => f.id) };
};
try {
  const broken = run(app('broken', {
    'package.json': pkg(),
    'manifest.toml': '[[components.interactive]]\nid = "com.example.app.main"\ncategories = ["com.amazon.category.main"]\n',
    'src/Ads.ts': adSource,
  }));
  check(broken.status === 1, 'audit exits 1 on the broken fixture');
  for (const id of ['M1', 'M2', 'M4', 'S1', 'S3', 'S4']) check(broken.ids.includes(id), `audit reports ${id} on the broken fixture`);

  const good = run(app('good', {
    'package.json': pkg({ '@xmldom/xmldom': '*' }),
    'manifest.toml': goodManifest,
    'src/Ads.ts': `import { VASTClient } from '@dailymotion/vast-client';
(globalThis as any).Image = class { set src(u: string) { fetch(u); } };
export const AD = 'https://cdn.example.com/ad.mp4';
export function onFirstFrame(player, instance) { new VASTClient(); setTimeout(() => player.setMediaControlFocus(instance), 0); }
`,
  }));
  check(good.status === 0 && good.ids.length === 0, `audit is clean on the good fixture (got ${good.ids.join(', ') || 'none'})`);

  const notVega = run(app('not-vega', { 'package.json': JSON.stringify({ dependencies: { react: '*' } }), 'src/a.ts': adSource }));
  check(notVega.status === 0 && notVega.ids.length === 0, 'audit skips a non-Vega project');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`vega-client-side-ads checks passed: ${passed}`);
