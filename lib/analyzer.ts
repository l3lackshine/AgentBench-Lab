export type PackageFile = {
  path: string;
  chars: number;
  estimatedTokens: number;
  kind: 'Agent' | 'Skill' | 'Knowledge' | 'Document';
  fingerprint: string;
};

export type Finding = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
};

export function normalizeArchivePath(name: string): string | null {
  if (!name || name.includes('\0')) return null;
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part === '' || part === '.')) return null;
  return normalized;
}

export function classifyPath(path: string): PackageFile['kind'] {
  const p = path.toLowerCase();
  if (/(^|\/)agents?\//.test(p) || /(^|\/)agent\.md$/.test(p)) return 'Agent';
  if (/(^|\/)skills?\//.test(p) || /(^|\/)skill\.md$/.test(p)) return 'Skill';
  if (/(^|\/)(knowledge|research)(\/|$)/.test(p)) return 'Knowledge';
  return 'Document';
}

const MARKDOWN_LINK = /!?\[[^\]]*\]\(([^)]+)\)/g;
const SKILL_NAME = /^[a-z0-9][a-z0-9_-]*$/i;

function fingerprint(content: string): string {
  // Deterministic FNV-1a 32-bit fingerprint; useful for change detection, not cryptographic security.
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function inspectPackage(input: Array<{ path: string; content: string }>) {
  const files: PackageFile[] = input.map(({ path, content }) => ({
    path,
    chars: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    kind: classifyPath(path),
    fingerprint: fingerprint(content),
  }));
  const findings: Finding[] = [];
  const pathSet = new Set(files.map((f) => f.path));
  const lowerPaths = new Map<string, string>();
  for (const file of files) {
    const lower = file.path.toLowerCase();
    const prior = lowerPaths.get(lower);
    if (prior && prior !== file.path) {
      findings.push({ severity: 'warning', code: 'CASE_COLLISION', file: file.path, message: `Path differs only by letter case from ${prior}.` });
    } else lowerPaths.set(lower, file.path);
  }

  const skillFiles = files.filter((f) => /(^|\/)skills?\/[^/]+\/skill\.md$/i.test(f.path));
  for (const skill of skillFiles) {
    const match = skill.path.match(/(?:^|\/)skills?\/([^/]+)\/skill\.md$/i);
    const folder = match?.[1] ?? '';
    if (!SKILL_NAME.test(folder)) {
      findings.push({ severity: 'warning', code: 'SKILL_FOLDER_NAME', file: skill.path, message: 'Skill folder names should use letters, numbers, underscores, or hyphens.' });
    }
    const body = input.find((f) => f.path === skill.path)?.content ?? '';
    if (!body.trim()) findings.push({ severity: 'warning', code: 'EMPTY_SKILL', file: skill.path, message: 'Skill definition is empty.' });
    if (!/^---\s*\n[\s\S]*?\n---/m.test(body)) {
      findings.push({ severity: 'info', code: 'SKILL_WITHOUT_FRONTMATTER', file: skill.path, message: 'No YAML frontmatter detected; metadata may be defined elsewhere.' });
    }
  }

  const skillFolders = new Set(files.map((f) => f.path.match(/^(.*?skills?\/[^/]+)\//i)?.[1]).filter((folder): folder is string => Boolean(folder)));
  for (const folder of skillFolders) {
    if (!files.some((f) => f.path.toLowerCase() === `${folder}/skill.md`.toLowerCase())) {
      findings.push({ severity: 'warning', code: 'MISSING_SKILL_MD', file: folder, message: 'Skill folder exists but has no SKILL.md entry point.' });
    }
  }

  const agentFiles = files.filter((f) => f.kind === 'Agent' && /\.mdx?$/i.test(f.path));
  for (const agent of agentFiles) {
    const body = input.find((f) => f.path === agent.path)?.content ?? '';
    if (!body.trim()) findings.push({ severity: 'warning', code: 'EMPTY_AGENT', file: agent.path, message: 'Agent definition is empty.' });
  }

  for (const item of input) {
    let match: RegExpExecArray | null;
    MARKDOWN_LINK.lastIndex = 0;
    while ((match = MARKDOWN_LINK.exec(item.content)) !== null) {
      const raw = match[1].trim().split(/[?#]/, 1)[0];
      if (!raw || /^(https?:|mailto:|data:|#)/i.test(raw)) continue;
      const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
      const target = decoded.startsWith('/') ? decoded.slice(1) : `${item.path.split('/').slice(0, -1).join('/')}/${decoded}`.replace(/^\//, '');
      const parts: string[] = [];
      let escapes = false;
      for (const part of target.split('/')) {
        if (part === '..') { if (!parts.length) { escapes = true; break; } parts.pop(); }
        else if (part && part !== '.') parts.push(part);
      }
      if (escapes) {
        findings.push({ severity: 'error', code: 'REFERENCE_ESCAPES_PACKAGE', file: item.path, message: `Reference escapes package root: ${raw}` });
      } else if (!pathSet.has(parts.join('/'))) {
        findings.push({ severity: 'warning', code: 'BROKEN_REFERENCE', file: item.path, message: `Referenced file was not found: ${raw}` });
      }
    }
  }

  if (!agentFiles.length) findings.push({ severity: 'info', code: 'NO_AGENT_FILES', message: 'No Agent Markdown definitions were detected by path convention.' });
  if (!skillFiles.length) findings.push({ severity: 'info', code: 'NO_SKILL_ENTRYPOINTS', message: 'No skills/<name>/SKILL.md entry points were detected.' });

  const totals = {
    files: files.length,
    chars: files.reduce((n, f) => n + f.chars, 0),
    estimatedTokens: files.reduce((n, f) => n + f.estimatedTokens, 0),
    agents: files.filter((f) => f.kind === 'Agent').length,
    skills: files.filter((f) => f.kind === 'Skill').length,
  };
  return { files, totals, findings };
}
