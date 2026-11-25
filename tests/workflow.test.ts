import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateWorkflow, runScenarioSuite, compareScenarioRuns } from '../lib/workflow.ts';

const files = [
 {path:'agents/master-agent.md',content:'---\nname: master-agent\ndescription: Coordinate and delegate tasks\n---\nCoordinator.'},
 {path:'agents/inventory-engineer.md',content:'---\nname: inventory-engineer\ndescription: Build inventory item storage database systems\ntriggers: inventory, items, storage\n---\nInventory specialist.'},
 {path:'agents/database-engineer.md',content:'---\nname: database-engineer\ndescription: Design database systems and inventory storage\ntriggers: database, inventory, storage\n---\nDatabase specialist.'},
 {path:'agents/map-designer.md',content:'---\nname: map-designer\ndescription: Create isometric maps and terrain layouts\ntriggers: map, terrain\n---\nMap specialist.'},
 {path:'skills/database/SKILL.md',content:'---\nname: database\ndescription: Database inventory storage persistence\ntriggers: inventory, storage\n---\nSkill.'},
];

test('explicit Agent ID takes priority over keyword routing',()=>{
 const r=simulateWorkflow('@agent:map-designer Build inventory storage',files);
 assert.ok(r.route.some(a=>a.id==='map-designer'&&a.role==='explicit'));
 assert.equal(r.explainability.routingPolicy,'explicit-agent-first');
});
test('unknown explicit Agent ID is reported',()=>{
 const r=simulateWorkflow('@agent:missing-agent build inventory',files);
 assert.ok(r.findings.some(f=>f.code==='EXPLICIT_AGENT_NOT_FOUND'));
});
test('responsibility overlap is exposed as conflict, not silently resolved',()=>{
 const r=simulateWorkflow('Build inventory storage database',files);
 assert.ok(r.conflicts.length>0);
 assert.ok(r.findings.some(f=>f.code==='AGENT_RESPONSIBILITY_OVERLAP'));
});
test('workflow handoff steps are ordered and explainable',()=>{
 const r=simulateWorkflow('Build inventory storage',files);
 assert.equal(r.workflow[0].step,1);
 assert.equal(r.workflow[0].receivesFrom,null);
 if(r.workflow[1]) assert.equal(r.workflow[1].receivesFrom,r.workflow[0].agentId);
});
test('scenario suite checks expected and forbidden Agents',()=>{
 const r=runScenarioSuite(files,[{id:'inventory',name:'Inventory route',task:'Build inventory storage',expectedAgentIds:['inventory-engineer'],mustNotSelectAgentIds:['map-designer']}]);
 assert.equal(r[0].status,'passed');
});
test('regression comparison detects changed routing',()=>{
 const old=runScenarioSuite(files,[{id:'one',name:'Inventory route',task:'Build inventory storage',expectedAgentIds:['inventory-engineer']}]);
 const changed=runScenarioSuite(files,[{id:'one',name:'Map override',task:'@agent:map-designer Build inventory storage'}]);
 const diff=compareScenarioRuns(old,changed);
 assert.equal(diff[0].status,'changed');
});
