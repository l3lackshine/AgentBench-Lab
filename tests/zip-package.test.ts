import test from 'node:test';
import assert from 'node:assert/strict';
const zipModule = await import('jszip').catch(() => null);
const JSZip = zipModule?.default;
const packageModule = zipModule ? await import('../lib/zip-package.ts') : null;
const readTextPackage = packageModule?.readTextPackage!;
const ZipPackageError = packageModule?.ZipPackageError!;

async function archive(entries: Array<[string, string]>) {
  if (!JSZip) throw new Error('jszip dependency unavailable');
  const zip = new JSZip();
  for (const [name, content] of entries) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

test('ZIP reader accepts supported text and ignores binary documents', { skip: !JSZip }, async () => {
  const bytes = await archive([['agents/builder.md', '# Builder'], ['images/logo.png', 'not actually parsed as text']]);
  const result = await readTextPackage(bytes);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'agents/builder.md');
  assert.match(result.warnings.join(' '), /untrusted data/i);
});

test('ZIP reader rejects traversal paths', { skip: !JSZip }, async () => {
  const bytes = await archive([['../escape.md', 'nope']]);
  await assert.rejects(() => readTextPackage(bytes), (error: unknown) => error instanceof ZipPackageError && /Unsafe archive path/.test(error.message));
});

test('ZIP reader rejects duplicate paths differing only by case', { skip: !JSZip }, async () => {
  const bytes = await archive([['Agents/a.md', 'a'], ['agents/A.md', 'b']]);
  await assert.rejects(() => readTextPackage(bytes), /Duplicate or case-colliding/);
});

test('ZIP reader rejects nested archives', { skip: !JSZip }, async () => {
  const bytes = await archive([['nested.zip', 'not a zip']]);
  await assert.rejects(() => readTextPackage(bytes), /Nested archive/);
});

test('ZIP reader rejects excessive compression ratios before expansion', { skip: !JSZip }, async () => {
  const bytes = await archive([['agents/large.md', 'A'.repeat(100_000)]]);
  await assert.rejects(() => readTextPackage(bytes), /Suspicious compression ratio/);
});

test('ZIP reader enforces archive and expanded text limits', { skip: !JSZip }, async () => {
  const bytes = await archive([['agents/a.md', 'A'.repeat(4096)]]);
  await assert.rejects(() => readTextPackage(bytes, { maxArchiveBytes: 10, maxFiles: 10, maxExpandedBytes: 10000, maxSingleFileBytes: 10000, maxCompressionRatio: 1000 }), /ZIP exceeds/);
  await assert.rejects(() => readTextPackage(bytes, { maxArchiveBytes: 100000, maxFiles: 10, maxExpandedBytes: 100, maxSingleFileBytes: 10000, maxCompressionRatio: 1000 }), /Expanded text exceeds/);
});
