export type SimFile = { path: string; content: string };
export type SimFinding = { severity: 'error' | 'warning' | 'info'; code: string; message: string; file?: string };
export type SimAgent = { id: string; path: string; name: string; description: string; body: string; score: number; matchedTerms: string[] };
export type SimSkill = { id: string; path: string; name: string; description: string; score: number; matchedTerms: string[] };

const STOP = new Set(['this','that','with','from','have','will','your','into','about','และ','หรือ','ของ','การ','ให้','เป็น','ได้','ใน','ที่','จาก','เพื่อ','ระบบ','ช่วย','ทำ']);
const tokenize = (s: string) => [...new Set((s.toLowerCase().match(/[a-z0-9ก-๙_-]{2,}/g) ?? []).filter(x => !STOP.has(x)))];
function frontmatter(body: string): Record<string, string> {
  const block = body.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1] ?? '';
  const out: Record<string,string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (m) out[m[1].toLowerCase()] = m[2].trim().replace(/^['"]|['"]$/g,'');
  }
  return out;
}
const basename = (p: string) => p.split('/').pop()?.replace(/\.(md|mdx|txt|ya?ml|json)$/i,'') ?? p;
const scoreTerms = (query: string, corpus: string) => {
  const q = tokenize(query); const c = new Set(tokenize(corpus));
  const matched = q.filter(t => c.has(t));
  return { score: matched.length, matchedTerms: matched };
};

export function simulateTask(task: string, input: SimFile[]) {
  const findings: SimFinding[] = [];
  const agents: SimAgent[] = input.filter(f => /(^|\/)agents?\/.*\.mdx?$/i.test(f.path) || /(^|\/)agent\.md$/i.test(f.path)).map(f => {
    const meta = frontmatter(f.content); const name = meta.name || basename(f.path);
    const description = meta.description || f.content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---')).slice(0,2).join(' ').slice(0,400);
    const scored = scoreTerms(task, `${name} ${description} ${meta.triggers ?? ''} ${meta.capabilities ?? ''}`);
    return { id: name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-'), path:f.path, name, description, body:f.content, ...scored };
  });
  const skills: SimSkill[] = input.filter(f => /(^|\/)skills?\/[^/]+\/skill\.md$/i.test(f.path)).map(f => {
    const meta = frontmatter(f.content); const name = meta.name || f.path.split('/').slice(-2,-1)[0] || basename(f.path);
    const description = meta.description || f.content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---')).slice(0,2).join(' ').slice(0,400);
    const scored = scoreTerms(task, `${name} ${description} ${meta.triggers ?? ''} ${meta.capabilities ?? ''}`);
    return { id:name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-'), path:f.path, name, description, ...scored };
  });

  if (!task.trim()) findings.push({severity:'error',code:'EMPTY_TASK',message:'Enter a task to simulate routing.'});
  if (!agents.length) findings.push({severity:'warning',code:'NO_AGENTS',message:'No Agent Markdown files were found. Routing cannot select an Agent.'});
  const coordinator = agents.find(a => /^(master[-_ ]agent|orchestrator|coordinator)$/i.test(a.name));
  const ranked = [...agents].sort((a,b) => b.score-a.score || a.name.localeCompare(b.name));
  const specialists = ranked.filter(a => a.score > 0 && a.id !== coordinator?.id).slice(0,4);
  const selectedAgents = [...(coordinator ? [coordinator] : []), ...specialists];
  if (!coordinator && specialists.length) findings.push({severity:'info',code:'NO_COORDINATOR',message:'No conventional coordinator Agent was detected; specialists are ranked directly.'});
  if (agents.length && !specialists.length && !coordinator) findings.push({severity:'warning',code:'NO_ROUTE_MATCH',message:'No Agent metadata matched the task. Add concise descriptions, triggers, or capabilities to Agent frontmatter.'});
  const selectedSkills = [...skills].filter(s => s.score > 0).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name)).slice(0,8);
  if (skills.length && !selectedSkills.length) findings.push({severity:'info',code:'NO_SKILL_MATCH',message:'No Skill metadata matched the task. Add descriptions or triggers to SKILL.md frontmatter.'});

  const selectedIds = selectedAgents.map(a => a.id);
  for (let i=0;i<selectedAgents.length;i++) for (let j=i+1;j<selectedAgents.length;j++) {
    const overlap = selectedAgents[i].matchedTerms.filter(t => selectedAgents[j].matchedTerms.includes(t));
    if (overlap.length >= 2) findings.push({severity:'warning',code:'POSSIBLE_AGENT_OVERLAP',message:`${selectedAgents[i].name} and ${selectedAgents[j].name} match the same terms: ${overlap.join(', ')}.`});
  }
  const contextFiles = [...selectedAgents.map(a => ({path:a.path,content:a.body,kind:'Agent'})), ...selectedSkills.map(s => {const f=input.find(x=>x.path===s.path)!;return {...f,kind:'Skill'};})];
  const contextChars = contextFiles.reduce((n,f)=>n+f.content.length,0) + task.length;
  return {
    task,
    route: selectedAgents.map(a => ({id:a.id,name:a.name,path:a.path,score:a.score,matchedTerms:a.matchedTerms,role:a===coordinator?'coordinator':'specialist'})),
    skills: selectedSkills.map(s => ({id:s.id,name:s.name,path:s.path,score:s.score,matchedTerms:s.matchedTerms})),
    context: { files:contextFiles.map(f=>({path:f.path,kind:f.kind,chars:f.content.length,estimatedTokens:Math.ceil(f.content.length/4)})), chars:contextChars, estimatedTokens:Math.ceil(contextChars/4) },
    findings,
    assumptions: ['Routing uses deterministic keyword overlap against Agent/Skill frontmatter and short descriptions.','This is a heuristic simulation, not an LLM decision or proof of runtime behavior.','Token count is characters ÷ 4 and excludes provider-specific tokenization, system prompts, tool schemas, and runtime metadata.','Uploaded content is treated as untrusted data and is never executed.'],
    summary: {availableAgents:agents.length,selectedAgents:selectedIds.length,availableSkills:skills.length,selectedSkills:selectedSkills.length}
  };
}
