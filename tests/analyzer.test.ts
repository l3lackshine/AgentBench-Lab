import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, inspectPackage, normalizeArchivePath } from '../lib/analyzer.ts';

test('rejects unsafe archive paths', () => {
  assert.equal(normalizeArchivePath('../secret.md'), null);
  assert.equal(normalizeArchivePath('a/../../secret.md'), null);
  assert.equal(normalizeArchivePath('/absolute.md'), null);
  assert.equal(normalizeArchivePath('C:\\secret.md'), null);
  assert.equal(normalizeArchivePath('agents\\helper.md'), 'agents/helper.md');
});

test('classifies Agent, Skill, Knowledge, and documents', () => {
  assert.equal(classifyPath('agents/router.md'), 'Agent');
  assert.equal(classifyPath('skills/search/SKILL.md'), 'Skill');
  assert.equal(classifyPath('knowledge/rules.md'), 'Knowledge');
  assert.equal(classifyPath('README.md'), 'Document');
});

test('detects missing skill entry points and broken references', () => {
  const report = inspectPackage([
    { path: 'agents/main.md', content: 'See [missing](../not-here.md)' },
    { path: 'skills/demo/examples.md', content: 'Example file' },
    { path: 'skills/valid/SKILL.md', content: '---\nname: valid\n---\nA valid skill.' },
  ]);
  const codes = report.findings.map((f) => f.code);
  assert.ok(codes.includes('MISSING_SKILL_MD'));
  assert.ok(codes.includes('BROKEN_REFERENCE'));
  assert.equal(report.totals.agents, 1);
  assert.equal(report.totals.skills, 2);
});

test('reports package-root reference escape', () => {
  const report = inspectPackage([{ path: 'agents/a.md', content: '[escape](../../outside.md)' }]);
  assert.ok(report.findings.some((f) => f.code === 'REFERENCE_ESCAPES_PACKAGE' && f.severity === 'error'));
});
