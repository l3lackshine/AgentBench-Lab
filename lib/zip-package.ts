import JSZip from 'jszip';
import { normalizeArchivePath } from './analyzer.ts';

export type PackageTextFile = { path: string; content: string };
export type ZipLimits = { maxArchiveBytes: number; maxFiles: number; maxExpandedBytes: number; maxSingleFileBytes: number; maxCompressionRatio: number };
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxArchiveBytes: 10 * 1024 * 1024,
  maxFiles: 500,
  maxExpandedBytes: 30 * 1024 * 1024,
  maxSingleFileBytes: 2 * 1024 * 1024,
  maxCompressionRatio: 100,
};
const TEXT_FILE = /\.(md|mdx|txt|json|ya?ml)$/i;
const NESTED_ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i;

export class ZipPackageError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'ZipPackageError'; this.status = status; }
}

export async function readTextPackage(data: ArrayBuffer | Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<{ files: PackageTextFile[]; warnings: string[] }> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > limits.maxArchiveBytes) throw new ZipPackageError(`ZIP exceeds ${limits.maxArchiveBytes} byte limit.`, 413);
  if (bytes.byteLength < 22) throw new ZipPackageError('ZIP is too small or malformed.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false }); }
  catch { throw new ZipPackageError('Could not read ZIP. It may be corrupt, encrypted, or malformed.'); }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > limits.maxFiles) throw new ZipPackageError(`Archive contains too many files (limit ${limits.maxFiles}).`, 413);
  const seen = new Set<string>();
  const folded = new Set<string>();
  const selected: Array<{ entry: (typeof entries)[number]; path: string; declared: number; compressed: number }> = [];
  let declaredTotal = 0;
  const warnings: string[] = [];

  for (const entry of entries) {
    const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    const safe = normalizeArchivePath(original);
    if (!safe) throw new ZipPackageError(`Unsafe archive path rejected: ${String(original).slice(0, 120)}`);
    const normalized = safe.normalize('NFC');
    if (seen.has(normalized) || folded.has(normalized.toLocaleLowerCase('en-US'))) throw new ZipPackageError(`Duplicate or case-colliding archive path: ${safe}`);
    seen.add(normalized); folded.add(normalized.toLocaleLowerCase('en-US'));

    const meta = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const declared = meta?.uncompressedSize;
    const compressed = meta?.compressedSize;
    if (!Number.isSafeInteger(declared) || declared! < 0 || !Number.isSafeInteger(compressed) || compressed! < 0) throw new ZipPackageError(`Invalid ZIP size metadata: ${safe}`);
    if (NESTED_ARCHIVE.test(safe)) throw new ZipPackageError(`Nested archive is not supported: ${safe}`, 415);
    const unixMode = (entry as unknown as { unixPermissions?: number | string }).unixPermissions;
    if (typeof unixMode === 'number' && (unixMode & 0o170000) === 0o120000) throw new ZipPackageError(`Symbolic links are not supported: ${safe}`);
    if (TEXT_FILE.test(safe)) {
      if (declared! > limits.maxSingleFileBytes) throw new ZipPackageError(`Text file exceeds per-file limit: ${safe}`, 413);
      if (declared! > 0 && (compressed === 0 || declared! / Math.max(compressed!, 1) > limits.maxCompressionRatio)) throw new ZipPackageError(`Suspicious compression ratio: ${safe}`, 413);
      declaredTotal += declared!;
      if (declaredTotal > limits.maxExpandedBytes) throw new ZipPackageError('Expanded text exceeds package limit.', 413);
      selected.push({ entry, path: safe, declared: declared!, compressed: compressed! });
    }
  }

  const files: PackageTextFile[] = [];
  let actualTotal = 0;
  for (const item of selected) {
    let content: string;
    try { content = await item.entry.async('string'); }
    catch { throw new ZipPackageError(`Could not decompress file: ${item.path}`); }
    const actual = new TextEncoder().encode(content).byteLength;
    if (actual > limits.maxSingleFileBytes || actual !== item.declared) throw new ZipPackageError(`Expanded size mismatch or per-file limit exceeded: ${item.path}`, 413);
    actualTotal += actual;
    if (actualTotal > limits.maxExpandedBytes) throw new ZipPackageError('Expanded text exceeds package limit.', 413);
    files.push({ path: item.path, content });
  }
  if (!files.length) warnings.push('No supported text files (.md, .mdx, .txt, .json, .yaml, .yml) were found.');
  warnings.push('Imported files are treated as untrusted data. Their code and instructions are never executed.');
  return { files, warnings };
}
