'use client';
import { useEffect, useState } from 'react';
import { compareSnapshots, createSnapshot, snapshotMarkdown, validateSnapshotImport, type PackageSnapshot } from '../lib/snapshots';
import { inspectPackage } from '../lib/analyzer';
import { simulateWorkflow, runScenarioSuite, type Scenario } from '../lib/workflow';
import type { PackageTextFile } from '../lib/zip-package';
import { estimateCost, estimateInputTokens, runClaudeRuntime, type RuntimeResult } from '../lib/provider-runtime';

type Mode = 'simulation' | 'runtime';
type Finding = { severity:'error'|'warning'|'info'; code:string; message:string; file?:string };
type Simulation = ReturnType<typeof simulateWorkflow> & { scenarioSuite?: ReturnType<typeof runScenarioSuite> | null; warnings?: string[] };
type Report = { files: {path:string; chars:number; estimatedTokens:number; kind:string; fingerprint:string}[]; totals:{files:number;chars:number;estimatedTokens:number;agents:number;skills:number}; warnings:string[]; findings:Finding[] };

function AdSlot({ placement }: { placement: 'footer' | 'workspace' }) {
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';
  if (!enabled) return null;
  return <aside className={`ad-slot ${placement === 'footer' ? 'mt-8' : 'mt-5'}`} aria-label="Advertisement">
    <span className="ad-label">ADVERTISEMENT</span>
    <span className="text-sm text-slate-400">พื้นที่โฆษณาขนาดเล็ก · จะไม่แสดงทับพื้นที่ทำงาน</span>
  </aside>;
}

export default function Home() {
  const [mode,setMode] = useState<Mode>('simulation');
  const [report,setReport] = useState<Report|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [selectedFile,setSelectedFile] = useState<string>('');
  const [packageFiles,setPackageFiles] = useState<PackageTextFile[]>([]);
  const [task,setTask] = useState('');
  const [simulation,setSimulation] = useState<Simulation|null>(null);
  const [scenarioJson,setScenarioJson] = useState('[\n  {\n    \"id\": \"inventory-basic\",\n    \"name\": \"Inventory routing\",\n    \"task\": \"Build inventory storage\",\n    \"expectedAgentIds\": [\"inventory-engineer\"],\n    \"mustNotSelectAgentIds\": [\"map-designer\"]\n  }\n]');
  const [simBusy,setSimBusy] = useState(false);
  const [snapshots,setSnapshots] = useState<PackageSnapshot[]>([]);
  const [snapshotLabel,setSnapshotLabel] = useState('');
  const [compareIds,setCompareIds] = useState<[string,string]>(['','']);
  const [snapshotMessage,setSnapshotMessage] = useState('');
  const [apiKey,setApiKey] = useState('');
  const [model,setModel] = useState('claude-sonnet-4-5');
  const [maxTokens,setMaxTokens] = useState(1200);
  const [inputPrice,setInputPrice] = useState('');
  const [outputPrice,setOutputPrice] = useState('');
  const [budgetUsd,setBudgetUsd] = useState('0.25');
  const [runtimeBusy,setRuntimeBusy] = useState(false);
  const [runtimeResult,setRuntimeResult] = useState<RuntimeResult|null>(null);
  const [runtimeError,setRuntimeError] = useState('');
  const [runtimeController,setRuntimeController] = useState<AbortController|null>(null);
  useEffect(()=>{ const clearOnExit=()=>setApiKey(''); window.addEventListener('pagehide',clearOnExit); return ()=>window.removeEventListener('pagehide',clearOnExit); },[]);
  useEffect(()=>{ try { const raw=localStorage.getItem('agentbench:snapshots:v1'); if(raw){ const parsed=validateSnapshotImport(JSON.parse(raw)); setSnapshots(parsed); } } catch { setSnapshotMessage('ไม่สามารถอ่าน Snapshot เดิมได้ — ไฟล์จัดเก็บอาจไม่ถูกต้อง'); } },[]);
  useEffect(()=>{ try { localStorage.setItem('agentbench:snapshots:v1',JSON.stringify(snapshots)); } catch { setSnapshotMessage('พื้นที่จัดเก็บเบราว์เซอร์เต็ม โปรด Export Snapshot แล้วลบรายการเก่า'); } },[snapshots]);
  const currentSnapshot = () => {
    if(!report) return null;
    return createSnapshot({ id: `snap-${Date.now()}`, label: snapshotLabel || `Snapshot ${new Date().toLocaleString()}`, createdAt: new Date().toISOString(), files: report.files, totals: { files: report.totals.files, chars: report.totals.chars, agents: report.totals.agents, skills: report.totals.skills }, task: simulation?.workflow?.length ? task : undefined, agents: simulation?.route?.map(a=>a.id), skills: simulation?.skills?.map(a=>a.id), scenarios: simulation?.scenarioSuite?.map(a=>({id:a.id,name:a.name,status:a.status,actualAgentIds:a.actualAgentIds,actualSkillIds:a.actualSkillIds})) });
  };
  function saveSnapshot(){ const snap=currentSnapshot(); if(!snap) return; setSnapshots(prev=>[snap,...prev].slice(0,200)); setSnapshotLabel(''); setSnapshotMessage('Snapshot saved in this browser.'); }
  function downloadFile(name:string, content:string, type:string){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
  function exportSnapshots(){ downloadFile('agentbench-snapshots.json',JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),snapshots},null,2),'application/json'); }
  async function importSnapshots(e:React.ChangeEvent<HTMLInputElement>){ const file=e.target.files?.[0]; if(!file)return; try { if(file.size>5*1024*1024) throw new Error('Import file exceeds 5 MB.'); const parsed=validateSnapshotImport(JSON.parse(await file.text())); setSnapshots(prev=>[...parsed,...prev].slice(0,200)); setSnapshotMessage(`Imported ${parsed.length} snapshot(s).`); } catch(err){setSnapshotMessage(err instanceof Error?err.message:'Import failed');} finally {e.target.value='';} }
  const comparison = compareIds[0]&&compareIds[1] ? (()=>{const a=snapshots.find(s=>s.id===compareIds[0]); const b=snapshots.find(s=>s.id===compareIds[1]); return a&&b?compareSnapshots(a,b):null;})() : null;
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]; if(!file) return;
    setSelectedFile(file.name); setPackageFiles([]); setSimulation(null);
    setBusy(true); setError(''); setReport(null);
    try {
      if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('เลือกได้เฉพาะไฟล์ .zip');
      if (file.size > 10 * 1024 * 1024) throw new Error('ZIP มีขนาดเกิน 10 MB');
      const worker = new Worker(new URL('../workers/zip-reader.worker.ts', import.meta.url));
      const buffer = await file.arrayBuffer();
      const result: {ok:boolean;files?:PackageTextFile[];warnings?:string[];error?:string} = await new Promise((resolve,reject)=>{
        worker.onmessage = event => { worker.terminate(); resolve(event.data); };
        worker.onerror = () => { worker.terminate(); reject(new Error('เกิดข้อผิดพลาดระหว่างอ่าน ZIP ใน Browser')); };
        worker.postMessage({type:'read',buffer},[buffer]);
      });
      if (!result.ok || !result.files) throw new Error(result.error || 'อ่าน ZIP ไม่สำเร็จ');
      setPackageFiles(result.files);
      setReport({...inspectPackage(result.files),warnings:result.warnings || []});
    } catch(err) { setError(err instanceof Error?err.message:'Unknown error'); setSelectedFile(''); }
    finally { setBusy(false); e.target.value=''; }
  }
  async function runRuntime() {
    if (!packageFiles.length || !task.trim()) return;
    setRuntimeError(''); setRuntimeResult(null);
    const inPrice = Number(inputPrice), outPrice = Number(outputPrice), budget = Number(budgetUsd);
    if (!apiKey.trim()) { setRuntimeError('กรุณาใส่ Anthropic API Key'); return; }
    if (!inputPrice.trim() || !outputPrice.trim() || !Number.isFinite(inPrice) || !Number.isFinite(outPrice) || inPrice < 0 || outPrice < 0) { setRuntimeError('กรุณากำหนดราคา Input และ Output ต่อ 1 ล้าน Token ให้ถูกต้อง เพื่อใช้คุมงบและคำนวณค่าใช้จ่าย'); return; }
    if (!budgetUsd.trim() || !Number.isFinite(budget) || budget <= 0) { setRuntimeError('กรุณากำหนดงบสูงสุดต่อครั้งเป็น USD มากกว่า 0'); return; }
    const route = simulateWorkflow(task, packageFiles);
    const selectedPaths = new Set([...route.route.map(a=>a.path), ...route.skills.map(a=>a.path)]);
    const rootDocs = packageFiles.filter(f => /^(README\.md|CLAUDE\.md|AGENTS?\.md|agent\.md)$/i.test(f.path));
    const selectedFiles = packageFiles.filter(f => selectedPaths.has(f.path) || rootDocs.some(r=>r.path===f.path));
    if (!selectedFiles.length) { setRuntimeError('ยังไม่พบไฟล์ Agent/Skill ที่ตรงกับ Task หรือไฟล์คำสั่งหลักใน ZIP จึงยังไม่มี Context ที่เหมาะสมสำหรับส่งทดสอบ'); return; }
    const packageContext = selectedFiles.map(f=>`\n--- FILE: ${f.path} ---\n${f.content}`).join('\n');
    if (packageContext.length > 120_000) { setRuntimeError('Context ที่เลือกมีขนาดเกิน 120,000 ตัวอักษร โปรดลดขนาด ZIP หรือแยกทดสอบ'); return; }
    const inputEstimate = estimateInputTokens(task + packageContext + model + ' '.repeat(1200));
    const worstCaseCost = estimateCost(inputEstimate, maxTokens, inPrice, outPrice);
    if (worstCaseCost > budget) { setRuntimeError(`ประมาณการค่าใช้จ่าย $${worstCaseCost.toFixed(4)} เกินงบ $${budget.toFixed(4)} กรุณาลด Max output tokens หรือเพิ่มงบ`); return; }
    const confirmed = window.confirm(`กำลังส่ง Task และไฟล์ Agent/Skill ที่เลือกไปยัง Anthropic (${model})\n\nประมาณ Input: ${inputEstimate.toLocaleString()} tokens\nOutput สูงสุด: ${maxTokens.toLocaleString()} tokens\nประมาณการค่าใช้จ่าย: $${worstCaseCost.toFixed(4)}\n\nAPI อาจคิดเงินจริงตามการใช้งาน คุณยืนยันให้เรียก API หรือไม่?`);
    if (!confirmed) return;
    setRuntimeBusy(true);
    const controller = new AbortController(); setRuntimeController(controller);
    try {
      const result = await runClaudeRuntime({ apiKey, model, task, packageContext, maxTokens, inputPricePerMillion: inPrice, outputPricePerMillion: outPrice, signal: controller.signal });
      if (result.estimatedCost > budget) setRuntimeError(`Provider usage ทำให้ค่าใช้จ่ายที่ประเมินจากเรตราคาที่กรอกอยู่ที่ $${result.estimatedCost.toFixed(4)} ซึ่งเกินงบที่ตั้งไว้ $${budget.toFixed(4)} โปรดตรวจสอบราคาและการใช้งานใน Anthropic Console`);
      setRuntimeResult(result);
    } catch(err) { setRuntimeError(err instanceof Error ? err.message : 'Runtime request failed'); }
    finally { setRuntimeBusy(false); setRuntimeController(null); }
  }
    async function runSimulation(withScenarios = false) {
    if(!packageFiles.length || !task.trim()) return;
    setSimBusy(true); setError(''); setSimulation(null);
    try {
      const result = simulateWorkflow(task, packageFiles);
      let scenarioSuite = null;
      if (withScenarios) {
        let scenarios: Scenario[];
        try { scenarios = JSON.parse(scenarioJson); } catch { throw new Error('Scenario JSON ไม่ถูกต้อง'); }
        if (!Array.isArray(scenarios) || scenarios.length < 1 || scenarios.length > 50) throw new Error('Scenario ต้องมี 1–50 รายการ');
        scenarioSuite = runScenarioSuite(packageFiles, scenarios);
      }
      setSimulation({...result,scenarioSuite,warnings:['Local simulation: ไม่มีการเรียก LLM API และไม่มีค่า API'] });
    } catch(err){setError(err instanceof Error?err.message:'Simulation failed');}
    finally {setSimBusy(false);}
  }
  return <main className="mx-auto max-w-6xl px-5 py-10">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm uppercase tracking-[.25em] text-cyan-300">Public • Open Source • Self-hostable</p><h1 className="mt-2 text-4xl font-bold">AgentBench <span className="text-cyan-300">Lab</span></h1><p className="mt-2 text-slate-400">A workspace to inspect, test, and benchmark AI Agents & Skills.</p></div>
      <span className="rounded-full border border-cyan-800 px-4 py-2 text-sm text-cyan-200">Local-First · v0.11.0</span>
    </header>

    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-500">Choose your testing environment</p><h2 className="mt-1 text-2xl font-semibold">เลือกโหมดการทดสอบ</h2></div><span className="text-xs text-slate-500">เปลี่ยนโหมดได้ตลอดเวลา</span></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <button type="button" onClick={()=>setMode('simulation')} aria-pressed={mode==='simulation'} className={`mode-card text-left ${mode==='simulation'?'mode-card-active':''}`}>
          <div className="flex items-center justify-between"><span className="text-2xl">🧪</span><span className={`mode-pill ${mode==='simulation'?'mode-pill-active':''}`}>{mode==='simulation'?'กำลังเลือกใช้งาน':'เลือกโหมดนี้'}</span></div>
          <h3 className="mt-3 text-xl font-semibold">Simulation Mode</h3><p className="mt-2 text-sm text-slate-400">ทดสอบแบบจำลองโดยไม่เรียก LLM API เหมาะสำหรับตรวจโครงสร้าง Agent, Skill, Routing และ Context</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300"><li>✓ ไม่เสียค่า API</li><li>✓ วิเคราะห์และตรวจสอบโครงสร้างแพ็กเกจ</li><li>✓ จำลอง Routing / Context / Scenario</li><li>✓ Token เป็นค่าประมาณเท่านั้น</li></ul>
        </button>
        <button type="button" onClick={()=>setMode('runtime')} aria-pressed={mode==='runtime'} className={`mode-card text-left ${mode==='runtime'?'mode-card-active':''}`}>
          <div className="flex items-center justify-between"><span className="text-2xl">🤖</span><span className={`mode-pill ${mode==='runtime'?'mode-pill-active':''}`}>{mode==='runtime'?'กำลังเลือกใช้งาน':'เลือกโหมดนี้'}</span></div>
          <h3 className="mt-3 text-xl font-semibold">Provider Runtime Mode</h3><p className="mt-2 text-sm text-slate-400">ทดสอบด้วยโมเดล AI จริง ผ่าน API ของ Provider ที่ผู้ใช้เลือกและนำ API Key มาเอง (BYOK)</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300"><li>✓ สนทนาและทดสอบ Agent ด้วยโมเดลจริง</li><li>✓ อ่าน Token Usage จาก Provider</li><li>✓ ประเมินค่าใช้จ่ายตามข้อมูลจริง</li><li>✓ Claude API โดยตรงจาก Browser (BYOK)</li></ul>
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
        {mode==='simulation' ? <p className="text-emerald-200">โหมดที่เลือก: Simulation — การวิเคราะห์ ZIP ด้านล่างจะไม่เรียกโมเดล AI และไม่มีค่า API</p> : <p className="text-amber-200">โหมดที่เลือก: Claude Runtime — เมื่อกดยืนยัน Task และเนื้อหา Agent/Skill ที่เลือกจะถูกส่งไป Anthropic และอาจมีค่าใช้จ่ายจริง</p>}
      </div>
    </section>

    <AdSlot placement="workspace" />

    <section className="mt-5 grid gap-5 md:grid-cols-3">
      <div className="panel p-5 md:col-span-2"><h2 className="text-xl font-semibold">เปิด Agent / Skill ZIP จากเครื่อง</h2><p className="mt-2 text-sm text-slate-400">เลือกไฟล์ ZIP จากอุปกรณ์ ระบบอ่านและวิเคราะห์ใน Browser โดยตรง ไม่อัปโหลด ZIP ไปยังเซิร์ฟเวอร์</p>
        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/70 p-8 text-center hover:border-cyan-400">
          <span className="text-3xl">⇧</span><span className="mt-2 font-medium">{busy?'กำลังอ่าน ZIP ในเครื่อง…':'เลือกไฟล์ ZIP จากเครื่อง'}</span><span className="mt-1 text-xs text-slate-500">สูงสุด 10 MB · อ่านในเครื่อง · ไม่ส่งไฟล์ออกไป</span>
          <input className="hidden" type="file" accept=".zip,application/zip" onChange={upload} disabled={busy}/>
        </label>{selectedFile&&<p className="mt-3 text-xs text-emerald-300">เลือกแล้ว: {selectedFile} · {packageFiles.length} text files</p>}
        <label className="mt-5 block text-sm font-medium text-slate-300">Task to test
          <textarea value={task} onChange={e=>setTask(e.target.value)} maxLength={5000} rows={4} placeholder="เช่น สร้างระบบ Inventory และ Item Storage สำหรับเกม MMORPG" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-cyan-500" />
        </label>
        <button type="button" disabled={!selectedFile||!task.trim()||simBusy||mode!=='simulation'} onClick={() => runSimulation()} className="mt-3 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{simBusy?'Simulating…':'Run Simulation'}</button>
        {mode==='runtime'&&<div className="mt-6 border-t border-slate-800 pt-5"><h3 className="text-lg font-semibold">Claude Provider Runtime</h3><p className="mt-1 text-xs text-slate-400">API Key ใช้ในหน่วยความจำของหน้านี้เท่านั้น ไม่บันทึกหรือส่งผ่าน AgentBench Server</p><label className="mt-4 block text-sm">Anthropic API Key<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-…" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label><label className="mt-3 block text-sm">Model ID<input value={model} onChange={e=>setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Max output tokens<input type="number" min={1} max={8192} value={maxTokens} onChange={e=>setMaxTokens(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label><label className="text-sm">Budget cap (USD)<input type="number" min="0.001" step="0.01" value={budgetUsd} onChange={e=>setBudgetUsd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label><label className="text-sm">Input price / 1M tokens (USD)<input type="number" min="0" step="0.01" value={inputPrice} onChange={e=>setInputPrice(e.target.value)} placeholder="ใส่ราคาปัจจุบันจาก Anthropic" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label><label className="text-sm">Output price / 1M tokens (USD)<input type="number" min="0" step="0.01" value={outputPrice} onChange={e=>setOutputPrice(e.target.value)} placeholder="ใส่ราคาปัจจุบันจาก Anthropic" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"/></label></div><p className="mt-3 text-xs text-amber-200">คำเตือน: Browser Runtime ใช้ API Key ภายใน Browser และส่งเนื้อหาที่เลือกไป Anthropic โดยตรง อย่าใช้บนเครื่องสาธารณะหรือแชร์หน้าจอที่เห็น Key งบนี้เป็นเพียงการประเมินจากอัตรา Token ที่กรอก ไม่ใช่วงเงินตัดการใช้งานจริง และอาจคลาดเคลื่อนจาก Tokenizer, cache pricing, ภาษี หรือราคา Provider โปรดตั้ง Spending Limit ใน Anthropic Console ด้วย</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={runRuntime} disabled={!selectedFile||!task.trim()||runtimeBusy} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">{runtimeBusy?'กำลังเรียก Claude…':'Run Claude Test (มีค่า API)'}</button>{runtimeBusy&&<button type="button" onClick={()=>runtimeController?.abort()} className="rounded-lg border border-rose-700 px-4 py-2 text-sm text-rose-200">Cancel</button>}<button type="button" onClick={()=>{setApiKey('');setRuntimeResult(null);setRuntimeError('');}} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Clear Key / Result</button></div>{runtimeError&&<p className="mt-3 text-sm text-rose-300">{runtimeError}</p>}</div>}
        {error&&<p className="mt-4 text-sm text-rose-300">{error}</p>}
        {error&&<p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
      <div className="panel p-5"><h2 className="text-xl font-semibold">Mode summary</h2><div className="mt-4 space-y-4"><div><p className="font-medium text-emerald-300">Simulation</p><p className="text-sm text-slate-400">Free local analysis and deterministic tests. No model API calls.</p></div><div><p className="font-medium text-amber-300">Provider Runtime</p><p className="text-sm text-slate-400">Claude BYOK execution from this browser, with provider token usage and cost estimates based on your entered price rates.</p></div></div></div>
    </section>
    {runtimeResult&&<section className="panel mt-6 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Claude Runtime Result</h2><span className="text-xs text-violet-200">Provider-reported usage · {runtimeResult.model}</span></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[['Input tokens',runtimeResult.usage.inputTokens.toLocaleString()],['Output tokens',runtimeResult.usage.outputTokens.toLocaleString()],['Estimated API cost',`$${runtimeResult.estimatedCost.toFixed(6)}`],['Duration',`${(runtimeResult.durationMs/1000).toFixed(1)}s`]].map(([k,v])=><div className="rounded-xl bg-slate-900 p-4" key={k}><p className="text-xs text-slate-400">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></div>)}</div><p className="mt-3 text-xs text-slate-500">Cache read: {runtimeResult.usage.cacheReadInputTokens.toLocaleString()} · Cache creation: {runtimeResult.usage.cacheCreationInputTokens.toLocaleString()} · Request ID: {runtimeResult.requestId||'not provided'}</p><div className="mt-5 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm leading-6">{runtimeResult.text}</div><p className="mt-3 text-xs text-amber-200">ค่าใช้จ่ายเป็นค่าประมาณจาก Token Usage จริงและราคามาตรฐานต่อ 1M Token ที่คุณกรอก อาจไม่รวมอัตรา Cache, ภาษี หรือส่วนลด และไม่ใช่ยอด Billing ที่ยืนยันจาก Anthropic</p></section>}
    {simulation&&<section className="panel mt-6 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Simulation result</h2><span className="text-xs text-emerald-300">No LLM API calls · No API cost</span></div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[['Agents selected',simulation.summary.selectedAgents],['Agents available',simulation.summary.availableAgents],['Skills selected',simulation.summary.selectedSkills],['Est. context tokens',simulation.context.estimatedTokens.toLocaleString()]].map(([k,v])=><div className="rounded-xl bg-slate-900 p-4" key={k}><p className="text-xs text-slate-400">{k}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}</div>
      <h3 className="mt-6 font-semibold">Agent routing</h3>{simulation.route.length?<ol className="mt-3 space-y-2">{simulation.route.map((a,i)=><li key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-cyan-300">{i+1}.</span><strong>{a.name}</strong><span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase">{a.role}</span><span className="ml-auto text-xs text-slate-400">score {a.score}</span></div><p className="mt-1 text-xs text-slate-500">{a.path}</p><p className="mt-1 text-xs text-slate-400">Matched: {a.matchedTerms.join(', ')||'coordinator rule'}</p></li>)}</ol>:<p className="mt-2 text-sm text-amber-300">No Agent selected. Add Agent descriptions, triggers, or capabilities.</p>}
      <h3 className="mt-6 font-semibold">Workflow handoff plan</h3><ol className="mt-3 space-y-2">{simulation.workflow.map(step=><li key={`${step.step}-${step.agentId}`} className="rounded-lg border border-slate-800 p-3"><div className="flex flex-wrap gap-2"><strong>{step.step}. {step.agentName}</strong><span className="text-xs text-cyan-300">{step.role}</span></div><p className="mt-1 text-sm text-slate-300">{step.action}</p><p className="mt-1 text-xs text-slate-500">{step.rationale}{step.receivesFrom?` · Receives from ${step.receivesFrom}`:''}</p></li>)}</ol>
      <h3 className="mt-6 font-semibold">Routing explainability</h3><p className="mt-1 text-xs text-slate-400">Policy: {simulation.explainability.routingPolicy} · Explicit IDs: {simulation.explainability.explicitAgentIds.join(', ')||'none'}</p><ul className="mt-2 space-y-1 text-xs text-slate-400">{simulation.explainability.rejectedAgents.map(a=><li key={a.agentId}>Not selected: <strong>{a.agentId}</strong> — {a.reason}</li>)}</ul>
      {simulation.conflicts.length>0&&<div className="mt-5"><h3 className="font-semibold text-amber-200">Agent responsibility conflicts</h3><ul className="mt-2 space-y-2">{simulation.conflicts.map((c,i)=><li key={i} className="rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-sm"><strong>{c.agents.join(' ↔ ')}</strong><p className="mt-1 text-xs text-slate-400">Shared terms: {c.sharedTerms.join(', ')}. {c.reason}</p></li>)}</ul></div>}
      <div className="mt-6 border-t border-slate-800 pt-5"><h3 className="font-semibold">Scenario / Regression Test Runner</h3><p className="mt-1 text-xs text-slate-400">ทดสอบหลายสถานการณ์ด้วยกฎชุดเดียวกัน โดยไม่เรียก LLM</p><textarea value={scenarioJson} onChange={e=>setScenarioJson(e.target.value)} rows={9} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs" aria-label="Scenario test JSON"/><button type="button" onClick={()=>runSimulation(true)} disabled={simBusy||!selectedFile||!task.trim()} className="mt-2 rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-200 disabled:opacity-40">Run Scenario Suite</button>{simulation.scenarioSuite&&<div className="mt-3 space-y-2">{simulation.scenarioSuite.map(item=><div key={item.id} className="rounded-lg bg-slate-900 p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{item.name}</strong><span className={item.status==='passed'?'text-emerald-300':'text-rose-300'}>{item.status.toUpperCase()}</span></div>{item.checks.map((c,i)=><p key={i} className="mt-1 text-xs text-slate-400">{c.pass?'✓':'✕'} {c.label}</p>)}</div>)}</div>}</div>
      <h3 className="mt-6 font-semibold">Selected Skills</h3>{simulation.skills.length?<ul className="mt-2 space-y-2">{simulation.skills.map(s=><li key={s.id} className="rounded-lg bg-slate-900 p-3"><strong className="text-sm">{s.name}</strong><p className="text-xs text-slate-500">{s.path} · score {s.score} · {s.matchedTerms.join(', ')}</p></li>)}</ul>:<p className="mt-2 text-sm text-slate-400">No matching Skills detected.</p>}
      <h3 className="mt-6 font-semibold">Context Inspector</h3><p className="mt-1 text-sm text-slate-400">{simulation.context.files.length} files · {simulation.context.chars.toLocaleString()} characters · approximately {simulation.context.estimatedTokens.toLocaleString()} tokens</p><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><tbody>{simulation.context.files.map(f=><tr key={f.path} className="border-t border-slate-800"><td className="p-2 font-mono">{f.path}</td><td className="p-2">{f.kind}</td><td className="p-2">{f.estimatedTokens.toLocaleString()} est. tokens</td></tr>)}</tbody></table></div>
      {simulation.findings.length>0&&<div className="mt-5"><h3 className="font-semibold">Routing findings</h3><ul className="mt-2 space-y-2">{simulation.findings.map((f,i)=><li key={i} className="rounded-lg border border-slate-800 p-3 text-sm"><span className="mr-2 font-mono text-xs text-amber-300">{f.code}</span>{f.message}</li>)}</ul></div>}
      <details className="mt-5 text-xs text-slate-500"><summary className="cursor-pointer">Simulation assumptions and limitations</summary><ul className="mt-2 list-disc space-y-1 pl-5">{simulation.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></details>
    </section>}
    {report&&<section className="panel mt-6 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Package analysis</h2><span className="text-xs text-emerald-300">Inspection complete</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">{[['Files',report.totals.files],['Agents',report.totals.agents],['Skills',report.totals.skills],['Characters',report.totals.chars.toLocaleString()],['Est. tokens',report.totals.estimatedTokens.toLocaleString()]].map(([k,v])=><div className="rounded-xl bg-slate-900 p-4" key={k}><p className="text-xs text-slate-400">{k}</p><p className="mt-1 text-2xl font-semibold">{v}</p></div>)}</div>
      {report.warnings.length>0&&<div className="mt-5 rounded-lg border border-amber-800 bg-amber-950/30 p-3"><p className="font-medium text-amber-200">Warnings</p><ul className="mt-2 list-disc pl-5 text-sm text-amber-100">{report.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
      <div className="mt-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">Structure findings</h3><span className="text-xs text-slate-500">{report.findings.length} finding(s)</span></div>{report.findings.length===0?<p className="mt-3 text-sm text-emerald-300">No structural issues detected by the current rules.</p>:<ul className="mt-3 space-y-2">{report.findings.map((f,i)=><li className="rounded-lg border border-slate-800 bg-slate-900/70 p-3" key={`${f.code}-${i}`}><div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${f.severity==='error'?'bg-rose-950 text-rose-300':f.severity==='warning'?'bg-amber-950 text-amber-300':'bg-sky-950 text-sky-300'}`}>{f.severity}</span><span className="font-mono text-xs text-slate-400">{f.code}</span>{f.file&&<span className="truncate font-mono text-xs text-slate-500">{f.file}</span>}</div><p className="mt-2 text-sm text-slate-200">{f.message}</p></li>)}</ul>}</div>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="p-2">File</th><th className="p-2">Type</th><th className="p-2">Chars</th><th className="p-2">Est. tokens</th></tr></thead><tbody>{report.files.map(f=><tr className="border-t border-slate-800" key={f.path}><td className="max-w-[28rem] truncate p-2 font-mono text-xs">{f.path}</td><td className="p-2">{f.kind}</td><td className="p-2">{f.chars.toLocaleString()}</td><td className="p-2">{f.estimatedTokens.toLocaleString()}</td></tr>)}</tbody></table></div>
      <p className="mt-4 text-xs text-slate-500">Estimated tokens use characters ÷ 4. This is not a tokenizer result or billable usage.</p>
    </section>}
    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">📸 Snapshot & Regression History</h2><p className="mt-1 text-sm text-slate-400">บันทึกสถานะไฟล์และผล Routing เพื่อเปรียบเทียบก่อน–หลังแก้ไข</p></div><span className="text-xs text-slate-500">{snapshots.length}/200 snapshots</span></div>
      <div className="mt-4 flex flex-wrap gap-2"><input value={snapshotLabel} onChange={e=>setSnapshotLabel(e.target.value)} placeholder="ชื่อ Snapshot (ไม่บังคับ)" className="min-w-[180px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/><button type="button" onClick={saveSnapshot} disabled={!report} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Save current Snapshot</button><button type="button" onClick={exportSnapshots} disabled={!snapshots.length} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40">Export JSON</button><label className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm">Import JSON<input type="file" accept="application/json,.json" className="hidden" onChange={importSnapshots}/></label></div>
      {snapshotMessage&&<p className="mt-2 text-xs text-cyan-300">{snapshotMessage}</p>}
      <p className="mt-3 text-xs text-slate-500">จัดเก็บใน localStorage ของเบราว์เซอร์นี้เท่านั้น ไม่ซิงก์ข้ามอุปกรณ์ และควร Export สำรองเป็นระยะ</p>
      {snapshots.length>0&&<><div className="mt-4 grid gap-2 md:grid-cols-2">{snapshots.map(s=><div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{s.label}</p><p className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()} · {s.package.totals.files} files · {s.simulation?.scenarios.length??0} scenarios</p></div><button type="button" onClick={()=>downloadFile(`${s.id}.md`,snapshotMarkdown(s),'text/markdown')} className="shrink-0 text-xs text-cyan-300">Export MD</button></div>)}</div>
      <div className="mt-5 border-t border-slate-800 pt-4"><h3 className="font-semibold">Compare two Snapshots</h3><div className="mt-2 grid gap-2 md:grid-cols-2"><select value={compareIds[0]} onChange={e=>setCompareIds([e.target.value,compareIds[1]])} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">เลือก Snapshot ก่อนแก้ไข</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select><select value={compareIds[1]} onChange={e=>setCompareIds([compareIds[0],e.target.value])} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"><option value="">เลือก Snapshot หลังแก้ไข</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      {comparison&&<div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-lg bg-slate-900 p-3 text-sm"><strong>Package changes</strong><p className="mt-2 text-slate-400">Added: {comparison.files.added.length} · Removed: {comparison.files.removed.length} · Modified: {comparison.files.modified.length}</p><p className="mt-1 text-xs text-slate-500">{[...comparison.files.added.map(x=>`+ ${x}`),...comparison.files.removed.map(x=>`− ${x}`),...comparison.files.modified.map(x=>`~ ${x}`)].join(' | ')||'No file changes detected'}</p></div><div className="rounded-lg bg-slate-900 p-3 text-sm"><strong>Routing & scenario changes</strong><p className="mt-2 text-slate-400">Agents +{comparison.agents.added.length}/−{comparison.agents.removed.length} · Skills +{comparison.skills.added.length}/−{comparison.skills.removed.length}</p><p className="mt-1 text-slate-400">Changed scenarios: {comparison.scenarios.changes.filter(x=>x.change==='changed').length} · New: {comparison.scenarios.changes.filter(x=>x.change==='new').length} · Removed: {comparison.scenarios.removed.length}</p>{comparison.scenarios.changes.filter(x=>x.change!=='unchanged').map(x=><p key={x.id} className="mt-1 text-xs text-amber-300">{x.id}: {x.previousStatus??'new'} → {x.currentStatus}{x.routingChanged?' · routing changed':''}</p>)}{!comparison.hasChanges&&<p className="mt-1 text-xs text-emerald-300">No changes detected.</p>}</div></div>}</div></>}
    </section>
    <section className="mt-8 grid gap-4 md:grid-cols-3">{[['Context Inspector','See which Agent and Skill files contribute to a prompt.'],['Test Runner','Build repeatable scenarios and regression suites.'],['Cost Benchmark','Compare provider-reported tokens and estimated costs.']].map(([h,d])=><div className="panel p-5" key={h}><h3 className="font-semibold">{h}</h3><p className="mt-2 text-sm text-slate-400">{d}</p><p className="mt-3 text-xs text-slate-500">Planned capability</p></div>)}</section>
    <AdSlot placement="footer" />
    <footer className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-500">AgentBench Lab · Local-First ZIP inspection · ZIP contents stay in this browser session. <span className="ml-2">Ads are optional and disabled by default.</span></footer>
  </main>;
}
