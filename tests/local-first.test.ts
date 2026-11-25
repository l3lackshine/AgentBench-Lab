import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

 test('web ZIP upload API routes are absent', async () => {
  await assert.rejects(() => access('app/api/analyze/route.ts'));
  await assert.rejects(() => access('app/api/simulate/route.ts'));
});

test('browser ZIP reader runs in a worker and has bounded archive limits', async () => {
  const worker = await readFile('workers/zip-reader.worker.ts', 'utf8');
  const page = await readFile('app/page.tsx', 'utf8');
  assert.match(page, /new Worker\(new URL\('\.\.\/workers\/zip-reader\.worker\.ts'/);
  assert.match(worker, /MAX_ARCHIVE = 10 \* 1024 \* 1024/);
  assert.match(worker, /MAX_FILES = 500/);
  assert.match(worker, /MAX_EXPANDED = 30 \* 1024 \* 1024/);
  assert.match(worker, /self\.postMessage\(\{ ok: true/);
  assert.match(worker, /never|ไม่รันโค้ด/i);
});

test('browser simulation calls local analysis functions rather than API routes', async () => {
  const page = await readFile('app/page.tsx', 'utf8');
  assert.match(page, /inspectPackage\(result\.files\)/);
  assert.match(page, /simulateWorkflow\(task, packageFiles\)/);
  assert.doesNotMatch(page, /fetch\(['"]\/api\/(analyze|simulate)/);
});
