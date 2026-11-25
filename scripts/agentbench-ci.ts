import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inspectPackage } from '../lib/analyzer.ts';
import { readTextPackage } from '../lib/zip-package.ts';
import { runScenarioSuite, compareScenarioRuns, type Scenario } from '../lib/workflow.ts';

type Args = { packageFile: string; scenariosFile: string; output: string; format: 'json' | 'junit'; baseline?: string; failOnRoutingChange: boolean; maxArchiveBytes: number; maxExpandedBytes: number; maxEntries: number };
const defaults: Args = { packageFile: '', scenariosFile: '', output: '', format: 'json', failOnRoutingChange: false, maxArchiveBytes: 20 * 1024 * 1024, maxExpandedBytes: 50 * 1024 * 1024, maxEntries: 2000 };

function parseArgs(argv: string[]): Args {
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    if (key === '--fail-on-routing-change') { args.failOnRoutingChange = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    if (key === '--package') args.packageFile = value;
    else if (key === '--scenarios') args.scenariosFile = value;
    else if (key === '--output') args.output = value;
    else if (key === '--format' && (value === 'json' || value === 'junit')) args.format = value;
    else if (key === '--baseline') args.baseline = value;
    else if (key === '--max-archive-bytes') args.maxArchiveBytes = Number(value);
    else if (key === '--max-expanded-bytes') args.maxExpandedBytes = Number(value);
    else if (key === '--max-entries') args.maxEntries = Number(value);
    else throw new Error(`Unknown or invalid option: ${key}`);
  }
  if (!args.packageFile || !args.scenariosFile) throw new Error('Usage: npm run agentbench:ci -- --package <zip> --scenarios <json> [--output <file>] [--format json|junit] [--baseline <json>] [--fail-on-routing-change]');
  for (const [name, value] of [['max archive bytes', args.maxArchiveBytes], ['max expanded bytes', args.maxExpandedBytes], ['max entries', args.maxEntries]] as const) if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}.`);
  return args;
}

async function loadPackage(zipPath: string, limits: Args) {
  const info = await stat(zipPath);
  if (info.size > limits.maxArchiveBytes) throw new Error(`ZIP exceeds archive size limit (${limits.maxArchiveBytes} bytes).`);
  const result = await readTextPackage(await readFile(zipPath), {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxFiles: limits.maxEntries,
    maxExpandedBytes: limits.maxExpandedBytes,
    maxSingleFileBytes: Math.min(limits.maxExpandedBytes, 10 * 1024 * 1024),
    maxCompressionRatio: 100,
  });
  return result.files;
}

function xml(value: string) { return value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!); }
function junit(result: any) {
  const cases = result.scenarios.map((scenario: any) => `<testcase classname="AgentBench" name="${xml(scenario.name)}">${scenario.status === 'failed' ? `<failure message="Scenario assertions failed">${xml(scenario.checks.filter((c: any) => !c.pass).map((c: any) => c.label).join('; '))}</failure>` : ''}</testcase>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${result.summary.total}" failures="${result.summary.failed}" errors="0"><testsuite name="AgentBench Regression" tests="${result.summary.total}" failures="${result.summary.failed}" errors="0">${cases}</testsuite></testsuites>\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageFiles = await loadPackage(args.packageFile, args);
  const raw = JSON.parse(await readFile(args.scenariosFile, 'utf8')) as { schemaVersion?: number; scenarios?: Scenario[] };
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.scenarios) || raw.scenarios.length < 1 || raw.scenarios.length > 50) throw new Error('Scenario file must use schemaVersion 1 and contain 1–50 scenarios.');
  for (const scenario of raw.scenarios) {
    if (!scenario || typeof scenario.id !== 'string' || typeof scenario.name !== 'string' || typeof scenario.task !== 'string' || scenario.task.length > 5000) throw new Error('Each scenario requires string id, name, task (maximum 5000 characters).');
    for (const field of ['expectedAgentIds', 'expectedSkillIds', 'mustNotSelectAgentIds'] as const) if (scenario[field] !== undefined && (!Array.isArray(scenario[field]) || scenario[field]!.some(id => typeof id !== 'string'))) throw new Error(`${field} must be an array of strings.`);
  }
  const analysis = inspectPackage(packageFiles);
  const scenarios = runScenarioSuite(packageFiles, raw.scenarios);
  let routingChanges: ReturnType<typeof compareScenarioRuns> = [];
  if (args.baseline) {
    const baseline = JSON.parse(await readFile(args.baseline, 'utf8'));
    if (baseline.schema !== 'agentbench-ci-result/v1' || !Array.isArray(baseline.scenarios)) throw new Error('Baseline must be an AgentBench CI JSON result (agentbench-ci-result/v1).');
    routingChanges = compareScenarioRuns(baseline.scenarios, scenarios);
  }
  const summary = { total: scenarios.length, passed: scenarios.filter(s => s.status === 'passed').length, failed: scenarios.filter(s => s.status === 'failed').length, errors: analysis.findings.filter(f => f.severity === 'error').length, routingChanged: routingChanges.filter(s => s.status === 'changed' || s.status === 'new').length };
  const result = { schema: 'agentbench-ci-result/v1', generatedAt: new Date().toISOString(), package: path.basename(args.packageFile), summary, findings: analysis.findings, scenarios: scenarios.map(({ result: _detail, ...s }) => s), routingChanges };
  const output = args.format === 'junit' ? junit(result) : `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, output, 'utf8'); else process.stdout.write(output);
  process.stderr.write(`AgentBench CI: ${summary.passed}/${summary.total} scenarios passed; ${summary.errors} analyzer errors; ${summary.routingChanged} routing changes.\n`);
  if (summary.failed > 0 || summary.errors > 0 || (args.failOnRoutingChange && summary.routingChanged > 0)) process.exitCode = 1;
}

main().catch(error => { process.stderr.write(`AgentBench CI error: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
