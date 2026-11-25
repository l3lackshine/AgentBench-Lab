import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const JSZipModule = await import('jszip').catch(() => null);
const JSZip = JSZipModule?.default;

async function fixture(expectedAgentIds: string[]) {
  if (!JSZip) throw new Error('jszip dependency unavailable');
  const dir = await mkdtemp(path.join(tmpdir(), 'agentbench-ci-'));
  const zip = new (JSZip!)();
  zip.file('agents/builder.md', '---\nname: builder\n---\nBuild interfaces and components.');
  zip.file('skills/api-documentation/SKILL.md', '---\nname: api-documentation\n---\nDocument API endpoints.');
  await writeFile(path.join(dir, 'package.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
  await writeFile(path.join(dir, 'scenarios.json'), JSON.stringify({ schemaVersion: 1, scenarios: [{ id: 'builder', name: 'Builder route', task: '@agent:builder build interface', expectedAgentIds }] }));
  return dir;
}

test('CI runner passes valid routing assertions and writes JSON', { skip: !JSZip }, async () => {
  const dir = await fixture(['builder']);
  try {
    const output = path.join(dir, 'result.json');
    const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/agentbench-ci.ts', '--package', path.join(dir, 'package.zip'), '--scenarios', path.join(dir, 'scenarios.json'), '--output', output], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.schema, 'agentbench-ci-result/v1');
    assert.equal(result.summary.passed, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CI runner exits non-zero when a scenario assertion fails', { skip: !JSZip }, async () => {
  const dir = await fixture(['writer']);
  try {
    const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/agentbench-ci.ts', '--package', path.join(dir, 'package.zip'), '--scenarios', path.join(dir, 'scenarios.json')], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /0\/1 scenarios passed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CI runner rejects unsafe ZIP paths', { skip: !JSZip }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentbench-ci-'));
  try {
    const zip = new (JSZip!)(); zip.file('../escape.md', 'bad');
    await writeFile(path.join(dir, 'package.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
    await writeFile(path.join(dir, 'scenarios.json'), JSON.stringify({ schemaVersion: 1, scenarios: [{ id: 'x', name: 'x', task: 'test' }] }));
    const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/agentbench-ci.ts', '--package', path.join(dir, 'package.zip'), '--scenarios', path.join(dir, 'scenarios.json')], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /Unsafe archive path/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
