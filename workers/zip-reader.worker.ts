import JSZip from 'jszip';

type Request = { type: 'read'; buffer: ArrayBuffer };
type TextFile = { path: string; content: string };
const MAX_ARCHIVE = 10 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_EXPANDED = 30 * 1024 * 1024;
const MAX_SINGLE = 2 * 1024 * 1024;
const MAX_RATIO = 100;
const TEXT_FILE = /\.(md|mdx|txt|json|ya?ml)$/i;
const NESTED_ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i;

function safePath(input: string): string | null {
  if (!input || input.includes('\\') || input.startsWith('/') || /^[a-z]:/i.test(input) || input.includes('\0')) return null;
  const parts = input.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data?.type !== 'read') return;
  try {
    const bytes = new Uint8Array(event.data.buffer);
    if (bytes.byteLength > MAX_ARCHIVE) throw new Error('ZIP มีขนาดเกิน 10 MB');
    if (bytes.byteLength < 22) throw new Error('ไฟล์ ZIP เล็กเกินไปหรือไม่ถูกต้อง');
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > MAX_FILES) throw new Error(`ZIP มีไฟล์มากเกินไป (จำกัด ${MAX_FILES} ไฟล์)`);
    const seen = new Set<string>();
    const selected: Array<{ entry: (typeof entries)[number]; path: string; size: number; compressed: number }> = [];
    let total = 0;
    for (const entry of entries) {
      const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
      const path = safePath(original);
      if (!path) throw new Error(`ปฏิเสธ path ที่ไม่ปลอดภัย: ${String(original).slice(0, 100)}`);
      const key = path.normalize('NFC').toLocaleLowerCase('en-US');
      if (seen.has(key)) throw new Error(`พบ path ซ้ำหรือชนกัน: ${path}`);
      seen.add(key);
      const unixMode = (entry as unknown as { unixPermissions?: number | string }).unixPermissions;
      if (typeof unixMode === 'number' && (unixMode & 0o170000) === 0o120000) throw new Error(`ไม่รองรับ symbolic link: ${path}`);
      if (NESTED_ARCHIVE.test(path)) throw new Error(`ไม่รองรับ ZIP ซ้อนหรือ archive ซ้อน: ${path}`);
      const meta = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
      const size = meta?.uncompressedSize;
      const compressed = meta?.compressedSize;
      if (!Number.isSafeInteger(size) || size! < 0 || !Number.isSafeInteger(compressed) || compressed! < 0) throw new Error(`ข้อมูลขนาดไฟล์ไม่ถูกต้อง: ${path}`);
      if (!TEXT_FILE.test(path)) continue;
      if (size! > MAX_SINGLE) throw new Error(`ไฟล์ข้อความใหญ่เกิน 2 MB: ${path}`);
      if (size! > 0 && (compressed === 0 || size! / Math.max(compressed!, 1) > MAX_RATIO)) throw new Error(`อัตราการบีบอัดน่าสงสัย: ${path}`);
      total += size!;
      if (total > MAX_EXPANDED) throw new Error('ขนาดไฟล์ข้อความหลังแตก ZIP เกิน 30 MB');
      selected.push({ entry, path, size: size!, compressed: compressed! });
    }
    const files: TextFile[] = [];
    let actualTotal = 0;
    for (const item of selected) {
      const content = await item.entry.async('string');
      const actual = new TextEncoder().encode(content).byteLength;
      if (actual !== item.size || actual > MAX_SINGLE) throw new Error(`ขนาดไฟล์หลังแตกไม่ตรงกับ metadata: ${item.path}`);
      actualTotal += actual;
      if (actualTotal > MAX_EXPANDED) throw new Error('ขนาดข้อมูลเกินขีดจำกัด');
      files.push({ path: item.path, content });
    }
    self.postMessage({ ok: true, files, warnings: [
      'ไฟล์ถูกอ่านภายใน Browser บนอุปกรณ์นี้ ไม่มีการส่ง ZIP หรือเนื้อหาไปยังเซิร์ฟเวอร์',
      'ระบบอ่านเฉพาะ .md, .mdx, .txt, .json, .yaml และ .yml; ไม่รันโค้ดหรือคำสั่งใน ZIP',
      ...(files.length ? [] : ['ไม่พบไฟล์ข้อความที่รองรับ'])
    ] });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'ไม่สามารถอ่าน ZIP ได้' });
  }
};
