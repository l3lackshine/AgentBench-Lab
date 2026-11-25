import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateTask } from '../lib/simulator.ts';

const fixture = [
 {path:'agents/master-agent.md',content:'---\nname: master-agent\ndescription: Coordinate tasks and delegate work\n---\nYou coordinate.'},
 {path:'agents/inventory-engineer.md',content:'---\nname: inventory-engineer\ndescription: Build inventory item storage equipment and database systems\ntriggers: inventory, items, storage\n---\nBuild inventory.'},
 {path:'agents/map-designer.md',content:'---\nname: map-designer\ndescription: Design isometric maps, terrain and world layouts\n---\nDesign maps.'},
 {path:'skills/database/SKILL.md',content:'---\nname: database\ndescription: Database schema and inventory persistence\ntriggers: inventory, storage\n---\nDatabase skill.'},
 {path:'skills/pixel-art/SKILL.md',content:'---\nname: pixel-art\ndescription: Pixel art sprite production\n---\nPixel art.'},
];

test('routes task to coordinator and matching specialist',()=>{
 const r=simulateTask('Build an inventory item storage system',fixture);
 assert.equal(r.route[0]?.name,'master-agent');
 assert.ok(r.route.some(a=>a.name==='inventory-engineer'));
 assert.ok(!r.route.some(a=>a.name==='map-designer'));
});
test('selects relevant skills and excludes unrelated skills',()=>{
 const r=simulateTask('Build inventory storage',fixture);
 assert.ok(r.skills.some(s=>s.name==='database'));
 assert.ok(!r.skills.some(s=>s.name==='pixel-art'));
});
test('context inspector only includes selected Agent and Skill files',()=>{
 const r=simulateTask('Build inventory storage',fixture);
 assert.ok(r.context.files.some(f=>f.path==='agents/inventory-engineer.md'));
 assert.ok(!r.context.files.some(f=>f.path==='agents/map-designer.md'));
});
test('reports missing metadata matches instead of inventing a route',()=>{
 const r=simulateTask('Explain a quantum telescope', [{path:'agents/helper.md',content:'# Helper\nDoes routine office work.'}]);
 assert.ok(r.findings.some(f=>f.code==='NO_ROUTE_MATCH'));
});
