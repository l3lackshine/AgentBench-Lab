export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SnapshotFile = { path: string; kind: string; chars: number; fingerprint: string };
export type SnapshotScenario = { id: string; name: string; status: string; actualAgentIds: string[]; actualSkillIds: string[] };
export type PackageSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  package: { files: SnapshotFile[]; totals: { files: number; chars: number; agents: number; skills: number } };
  simulation: { task: string; agents: string[]; skills: string[]; scenarios: SnapshotScenario[] } | null;
};

export function createSnapshot(input: {
  id: string; label: string; createdAt: string;
  files: SnapshotFile[];
  totals: { files: number; chars: number; agents: number; skills: number };
  task?: string;
  agents?: string[];
  skills?: string[];
  scenarios?: SnapshotScenario[];
}): PackageSnapshot {
  return {
    id: input.id, label: input.label.trim() || 'Untitled snapshot', createdAt: input.createdAt,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    package: { files: input.files.map(f => ({ ...f })), totals: { ...input.totals } },
    simulation: input.task ? { task: input.task, agents: [...(input.agents ?? [])], skills: [...(input.skills ?? [])], scenarios: (input.scenarios ?? []).map(s => ({ ...s, actualAgentIds: [...s.actualAgentIds], actualSkillIds: [...s.actualSkillIds] })) } : null,
  };
}

export function compareSnapshots(before: PackageSnapshot, after: PackageSnapshot) {
  const oldFiles = new Map(before.package.files.map(f => [f.path, f]));
  const newFiles = new Map(after.package.files.map(f => [f.path, f]));
  const added = after.package.files.filter(f => !oldFiles.has(f.path)).map(f => f.path);
  const removed = before.package.files.filter(f => !newFiles.has(f.path)).map(f => f.path);
  const modified = after.package.files.filter(f => {
    const old = oldFiles.get(f.path);
    return old && old.fingerprint !== f.fingerprint;
  }).map(f => f.path);
  const oldAgents = new Set(before.simulation?.agents ?? []);
  const newAgents = new Set(after.simulation?.agents ?? []);
  const oldSkills = new Set(before.simulation?.skills ?? []);
  const newSkills = new Set(after.simulation?.skills ?? []);
  const addedAgents = [...newAgents].filter(id => !oldAgents.has(id));
  const removedAgents = [...oldAgents].filter(id => !newAgents.has(id));
  const addedSkills = [...newSkills].filter(id => !oldSkills.has(id));
  const removedSkills = [...oldSkills].filter(id => !newSkills.has(id));
  const oldScenarios = new Map((before.simulation?.scenarios ?? []).map(s => [s.id, s]));
  const newScenarios = new Map((after.simulation?.scenarios ?? []).map(s => [s.id, s]));
  const scenarioChanges = [...newScenarios.values()].map(current => {
    const previous = oldScenarios.get(current.id);
    if (!previous) return { id: current.id, change: 'new' as const, previousStatus: null, currentStatus: current.status, routingChanged: true };
    const routingChanged = JSON.stringify(previous.actualAgentIds) !== JSON.stringify(current.actualAgentIds) || JSON.stringify(previous.actualSkillIds) !== JSON.stringify(current.actualSkillIds);
    return { id: current.id, change: previous.status === current.status && !routingChanged ? 'unchanged' as const : 'changed' as const, previousStatus: previous.status, currentStatus: current.status, routingChanged };
  });
  const removedScenarios = [...oldScenarios.keys()].filter(id => !newScenarios.has(id));
  return { files: { added, removed, modified }, agents: { added: addedAgents, removed: removedAgents }, skills: { added: addedSkills, removed: removedSkills }, scenarios: { changes: scenarioChanges, removed: removedScenarios }, hasChanges: Boolean(added.length || removed.length || modified.length || addedAgents.length || removedAgents.length || addedSkills.length || removedSkills.length || removedScenarios.length || scenarioChanges.some(s => s.change !== 'unchanged')) };
}

export function validateSnapshotImport(value: unknown): PackageSnapshot[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid snapshot file.');
  const data = value as { schemaVersion?: unknown; snapshots?: unknown };
  if (data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !Array.isArray(data.snapshots)) throw new Error('Unsupported snapshot export format.');
  if (data.snapshots.length > 200) throw new Error('Snapshot import is limited to 200 records.');
  for (const item of data.snapshots) {
    if (!item || typeof item !== 'object' || (item as PackageSnapshot).schemaVersion !== SNAPSHOT_SCHEMA_VERSION || typeof (item as PackageSnapshot).id !== 'string' || !Array.isArray((item as PackageSnapshot).package?.files)) throw new Error('Snapshot file contains an invalid record.');
  }
  return data.snapshots as PackageSnapshot[];
}

export function snapshotMarkdown(snapshot: PackageSnapshot): string {
  const lines = [`# AgentBench Lab Regression Report`, '', `- Snapshot: ${snapshot.label}`, `- Created: ${snapshot.createdAt}`, `- Files: ${snapshot.package.totals.files}`, `- Agents: ${snapshot.package.totals.agents}`, `- Skills: ${snapshot.package.totals.skills}`, ''];
  if (snapshot.simulation) {
    lines.push('## Routing', '', `Task: ${snapshot.simulation.task}`, '', `Agents: ${snapshot.simulation.agents.join(', ') || 'None'}`, `Skills: ${snapshot.simulation.skills.join(', ') || 'None'}`, '', '## Scenarios', '');
    for (const scenario of snapshot.simulation.scenarios) lines.push(`- **${scenario.name}** (${scenario.id}): ${scenario.status}; Agents: ${scenario.actualAgentIds.join(', ') || 'None'}; Skills: ${scenario.actualSkillIds.join(', ') || 'None'}`);
  }
  lines.push('', '> Simulation is deterministic routing analysis. It does not execute Agent prompts or verify generated answer quality.', '');
  return lines.join('\n');
}
