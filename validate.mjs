// Content validation. Run with: npm run validate
// Checks the structural rules from the project brief and exercises every calculator on its own example.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { loadContent, ROOT } from './lib.mjs';

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const c = loadContent();
const { kpis, perspectives, goals, comparisons, glossary, learning } = c;
const LABELS = new Set(['book', 'applied', 'addition', 'verify']);
const perspectiveIds = new Set(perspectives.map((p) => p.id));
const ids = new Set();

// --- Exactly 75 records, unique and complete numbering -------------------------------------------
if (kpis.length !== 75) err(`Expected 75 KPI records, found ${kpis.length}.`);
const numbers = kpis.map((k) => k.originalNumber);
if (new Set(numbers).size !== numbers.length) err('Duplicate originalNumber values.');
for (let n = 1; n <= 75; n++) if (!numbers.includes(n)) err(`Missing KPI number ${n}.`);
c.kpiFiles.forEach((f, i) => {
  const k = kpis[i];
  const expected = `${String(k.originalNumber).padStart(2, '0')}-${k.id}.json`;
  if (f !== expected) err(`File name ${f} does not match "${expected}".`);
});

// --- Perspectives --------------------------------------------------------------------------------
const expectedCounts = { financial: 18, customer: 8, marketing: 11, operations: 18, employee: 12, csr: 8 };
for (const p of perspectives) {
  const actual = kpis.filter((k) => k.perspectiveId === p.id).length;
  if (actual !== expectedCounts[p.id]) err(`Perspective ${p.id}: expected ${expectedCounts[p.id]} KPIs, found ${actual}.`);
  if (p.count !== actual) err(`Perspective ${p.id}: declared count ${p.count} != actual ${actual}.`);
  const inRange = kpis.filter((k) => k.originalNumber >= p.firstNumber && k.originalNumber <= p.lastNumber);
  if (inRange.some((k) => k.perspectiveId !== p.id)) err(`Perspective ${p.id}: numbers ${p.firstNumber}–${p.lastNumber} are not all in this perspective.`);
}

// --- Per-record rules ----------------------------------------------------------------------------
for (const k of kpis) {
  const at = `KPI ${k.originalNumber} (${k.id})`;
  if (ids.has(k.id)) err(`${at}: duplicate id.`);
  ids.add(k.id);
  if (!k.nameEn?.trim()) err(`${at}: missing nameEn.`);
  if (!k.nameAr?.trim()) err(`${at}: missing nameAr.`);
  if (!perspectiveIds.has(k.perspectiveId)) err(`${at}: invalid perspectiveId "${k.perspectiveId}".`);
  if (!k.summary?.trim()) err(`${at}: missing summary.`);
  if (!LABELS.has(k.sourceLabel)) err(`${at}: invalid sourceLabel.`);
  if (k.managementQuestion && !LABELS.has(k.managementQuestion.label)) err(`${at}: invalid managementQuestion label.`);
  if (k.sourcePage != null && !(Number.isInteger(k.sourcePage) && k.sourcePage > 0)) err(`${at}: invalid sourcePage.`);
  if (k.sourcePage == null) warn(`${at}: sourcePage is null.`);
  if (!['identity-verified', 'needs-verification'].includes(k.verificationStatus)) err(`${at}: invalid verificationStatus.`);
  const f = k.formula;
  if (!f?.display) err(`${at}: missing formula.display.`);
  else if (f.type === 'calculator') {
    if (!f.calculatorId) err(`${at}: calculator type without calculatorId.`);
    if (f.components) err(`${at}: calculator KPIs must not define worksheet components.`);
  } else if (f.type === 'worksheet') {
    if (f.calculatorId) err(`${at}: worksheet KPI must not have a calculatorId.`);
    if (!Array.isArray(f.components) || f.components.length === 0) err(`${at}: worksheet KPI needs components.`);
  } else err(`${at}: invalid formula.type.`);
  for (const rid of k.relatedKpiIds ?? []) {
    if (rid === k.id) err(`${at}: relates to itself.`);
    else if (!kpis.some((x) => x.id === rid)) err(`${at}: related KPI "${rid}" does not exist.`);
  }
  if (!k.relatedKpiIds?.length) warn(`${at}: no related KPIs.`);
  if (/\d+\s*%\s*(هدف|مستهدف)|المتوسط الصناعي|متوسط القطاع/.test(JSON.stringify(k))) warn(`${at}: may contain a universal target or an industry average; review.`);
}

// --- Goals / comparisons / glossary / learning ---------------------------------------------------
for (const g of goals) {
  if (!g.kpiIds.length) err(`Goal ${g.id}: no KPIs.`);
  for (const e of g.kpiIds) if (!ids.has(e.id)) err(`Goal ${g.id}: unknown KPI "${e.id}".`);
}
for (const cmp of comparisons) {
  if (cmp.kpiIds.length < 2 || cmp.kpiIds.length > 3) err(`Comparison ${cmp.id}: needs 2–3 KPIs.`);
  for (const id of cmp.kpiIds) if (!ids.has(id)) err(`Comparison ${cmp.id}: unknown KPI "${id}".`);
  for (const r of cmp.rows) if (r.values.length !== cmp.kpiIds.length) err(`Comparison ${cmp.id}: row "${r.label}" has ${r.values.length} values for ${cmp.kpiIds.length} KPIs.`);
}
const gIds = new Set();
for (const t of glossary) {
  if (gIds.has(t.id)) err(`Glossary: duplicate id ${t.id}.`);
  gIds.add(t.id);
  if (!LABELS.has(t.label)) err(`Glossary ${t.id}: invalid label.`);
}
for (const m of learning) {
  for (const s of m.sections) if (!LABELS.has(s.label)) err(`Learning ${m.id}: invalid section label.`);
  for (const q of m.quiz) {
    if (q.answer < 0 || q.answer >= q.options.length) err(`Learning ${m.id}: quiz answer out of range.`);
  }
}

// --- Calculators: every referenced calculator exists and runs on its own example ------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-validate-'));
const outfile = path.join(tmp, 'calculators.mjs');
await build({ entryPoints: [path.join(ROOT, 'src/lib/calculators.ts')], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { CALCULATORS, runExample } = await import(outfile);
const used = new Set();
for (const k of kpis) {
  if (k.formula.type !== 'calculator') continue;
  const def = CALCULATORS[k.formula.calculatorId];
  if (!def) { err(`KPI ${k.originalNumber}: calculator "${k.formula.calculatorId}" is not defined.`); continue; }
  used.add(def.id);
  const variants = def.variants?.length ? def.variants.map((v) => v.id) : [null];
  for (const v of variants) {
    const r = runExample({ ...def, exampleVariant: v ?? def.exampleVariant }, 'ج.م');
    if (r.status !== 'ok') err(`KPI ${k.originalNumber}: calculator ${def.id}${v ? ` [${v}]` : ''} example did not run (${r.status}${r.message ? `: ${r.message}` : ''}).`);
    else if (!Number.isFinite(r.out.value)) err(`KPI ${k.originalNumber}: calculator ${def.id} example gave non-finite value.`);
  }
}
for (const id of Object.keys(CALCULATORS)) if (!used.has(id)) warn(`Calculator "${id}" is not used by any KPI.`);
fs.rmSync(tmp, { recursive: true, force: true });

// --- Report ------------------------------------------------------------------------------------
const needVerify = kpis.filter((k) => k.verificationStatus !== 'identity-verified').length;
console.log(`KPIs: ${kpis.length} | perspectives: ${perspectives.length} | calculators: ${used.size} | worksheets: ${kpis.filter((k) => k.formula.type === 'worksheet').length}`);
console.log(`Goals: ${goals.length} | comparisons: ${comparisons.length} | glossary: ${glossary.length} | learning modules: ${learning.length}`);
console.log(`KPIs flagged "needs-verification": ${needVerify}`);
for (const w of warnings) console.log(`  warn: ${w}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\n✓ Content validation passed.');
