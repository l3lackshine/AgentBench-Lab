import { simulateTask, type SimFile } from './simulator.ts';

export type Scenario = {
  id: string;
  name: string;
  task: string;
  expectedAgentIds?: string[];
  expectedSkillIds?: string[];
  mustNotSelectAgentIds?: string[];
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
const uniq = <T,>(values: T[]) => [...new Set(values)];

function explicitAgentRequest(task: string, files: SimFile[]) {
  const available = files.filter(f => /(^|\/)agents?\/.*\.mdx?$/i.test(f.path) || /(^|\/)agent\.md$/i.test(f.path));
  const tokens = [...task.matchAll(/(?:@agent:|\[agent:)([a-z0-9_-]+)\]?/gi)].map(m => normalize(m[1]));
  const exactNames = available.map(f => {
    const name = f.content.match(/^name\s*:\s*['"]?([^\r\n'"]+)/mi)?.[1]?.trim() || f.path.split('/').pop()!.replace(/\.mdx?$/i, '');
    return { id: normalize(name), name, path: f.path };
  });
  const matches = tokens.flatMap(token => exactNames.filter(a => a.id === token));
  return { tokens: uniq(tokens), matches: uniq(matches.map(m => m.id)).map(id => exactNames.find(a => a.id === id)!) };
}

export function simulateWorkflow(task: string, files: SimFile[]) {
  const base = simulateTask(task, files);
  const explicit = explicitAgentRequest(task, files);
  const findings = [...base.findings];
  let route = base.route;
  if (explicit.tokens.length) {
    const missing = explicit.tokens.filter(token => !explicit.matches.some(m => m.id === token));
    for (const id of missing) findings.push({ severity: 'warning', code: 'EXPLICIT_AGENT_NOT_FOUND', message: `Explicit Agent ID "${id}" was requested but is not present in the uploaded package.` });
    if (explicit.matches.length) {
      const selected = new Set(explicit.matches.map(m => m.id));
      route = [
        ...base.route.filter(a => a.role === 'coordinator' && !selected.has(a.id)),
        ...explicit.matches.map(m => ({ id: m.id, name: m.name, path: m.path, score: 0, matchedTerms: [], role: 'explicit' })),
        ...base.route.filter(a => a.role !== 'coordinator' && !selected.has(a.id)),
      ];
      findings.push({ severity: 'info', code: 'EXPLICIT_AGENT_PRIORITY', message: `Explicit Agent request takes priority over keyword routing: ${explicit.matches.map(m => m.name).join(', ')}.` });
    }
  }

  const conflicts: Array<{ agents: string[]; sharedTerms: string[]; reason: string }> = [];
  for (let i = 0; i < route.length; i++) for (let j = i + 1; j < route.length; j++) {
    const a = route[i], b = route[j];
    const sharedTerms = a.matchedTerms.filter(t => b.matchedTerms.includes(t));
    if (sharedTerms.length >= 2) conflicts.push({ agents: [a.name, b.name], sharedTerms, reason: 'Both Agents matched at least two identical task terms. Review responsibility boundaries.' });
  }
  for (const conflict of conflicts) findings.push({ severity: 'warning', code: 'AGENT_RESPONSIBILITY_OVERLAP', message: `${conflict.agents.join(' ↔ ')} share responsibility signals: ${conflict.sharedTerms.join(', ')}.` });

  const workflow = route.map((agent, index) => ({
    step: index + 1,
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    action: index === 0 && agent.role === 'coordinator' ? 'Receive task and coordinate delegation' : index === 0 ? 'Receive task as primary specialist' : 'Receive delegated task context',
    receivesFrom: index === 0 ? null : route[index - 1].id,
    rationale: agent.role === 'explicit' ? 'Selected because the task explicitly named this Agent ID.' : agent.role === 'coordinator' ? 'Selected by coordinator naming convention.' : `Selected by keyword overlap: ${agent.matchedTerms.join(', ') || 'routing fallback'}.`,
  }));

  const explainability = {
    explicitAgentIds: explicit.tokens,
    matchedExplicitAgents: explicit.matches.map(m => m.id),
    routingPolicy: explicit.tokens.length ? 'explicit-agent-first' : 'coordinator-then-keyword-ranking',
    decisions: route.map(agent => ({ agentId: agent.id, selected: true, reason: agent.role === 'explicit' ? 'Explicit ID in task' : agent.role === 'coordinator' ? 'Coordinator convention' : `Matched ${agent.matchedTerms.length} task terms`, matchedTerms: agent.matchedTerms })),
    rejectedAgents: base.route.filter(a => !route.some(r => r.id === a.id)).map(a => ({ agentId: a.id, reason: a.score === 0 ? 'No keyword match and not explicitly requested' : 'Lower-ranked route omitted by selection policy' })),
  };
  return { ...base, route, findings, workflow, conflicts, explainability, assumptions: [...base.assumptions, 'Explicit Agent syntax: @agent:agent-id or [agent:agent-id].', 'Workflow steps are a deterministic routing plan; no Agent prompt is executed and no actual handoff occurs.'] };
}

export function runScenarioSuite(files: SimFile[], scenarios: Scenario[]) {
  if (!Array.isArray(scenarios) || scenarios.length > 50) throw new Error('Scenario suite must contain between 1 and 50 scenarios.');
  return scenarios.map((scenario, index) => {
    const result = simulateWorkflow(scenario.task, files);
    const agentIds = result.route.map(a => a.id);
    const skillIds = result.skills.map(s => s.id);
    const checks = [
      ...(scenario.expectedAgentIds ?? []).map(id => ({ label: `Agent ${id} selected`, pass: agentIds.includes(normalize(id)) })),
      ...(scenario.expectedSkillIds ?? []).map(id => ({ label: `Skill ${id} selected`, pass: skillIds.includes(normalize(id)) })),
      ...(scenario.mustNotSelectAgentIds ?? []).map(id => ({ label: `Agent ${id} not selected`, pass: !agentIds.includes(normalize(id)) })),
    ];
    return { id: scenario.id || `scenario-${index + 1}`, name: scenario.name || `Scenario ${index + 1}`, task: scenario.task, status: checks.every(c => c.pass) ? 'passed' : 'failed', checks, actualAgentIds: agentIds, actualSkillIds: skillIds, result };
  });
}

export function compareScenarioRuns(previous: ReturnType<typeof runScenarioSuite>, current: ReturnType<typeof runScenarioSuite>) {
  const oldById = new Map(previous.map(item => [item.id, item]));
  return current.map(item => {
    const old = oldById.get(item.id);
    if (!old) return { id: item.id, status: 'new' as const, previous: null, current: item.status };
    return { id: item.id, status: old.status === item.status && JSON.stringify(old.actualAgentIds) === JSON.stringify(item.actualAgentIds) && JSON.stringify(old.actualSkillIds) === JSON.stringify(item.actualSkillIds) ? 'unchanged' as const : 'changed' as const, previous: old.status, current: item.status, previousAgentIds: old.actualAgentIds, currentAgentIds: item.actualAgentIds };
  });
}
