// Shared helpers for build / validate / serve scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** Reads every content file. Each KPI lives in its own JSON file so it can be updated independently. */
export function loadContent() {
  const dir = path.join(ROOT, 'content', 'kpis');
  const kpis = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ ...readJson(`content/kpis/${f}`), __file: f }))
    .sort((a, b) => a.originalNumber - b.originalNumber);
  return {
    perspectives: readJson('content/perspectives.json'),
    kpis: kpis.map(({ __file, ...k }) => k),
    kpiFiles: kpis.map((k) => k.__file),
    goals: readJson('content/goals.json'),
    comparisons: readJson('content/comparisons.json'),
    glossary: readJson('content/glossary.json'),
    learning: readJson('content/learning.json'),
  };
}

/** Writes the merged content bundle imported by the app (kept out of source control by design). */
export function writeGenerated() {
  const c = loadContent();
  const { kpiFiles, ...content } = c;
  const out = path.join(ROOT, 'src', 'generated');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'content.json'), JSON.stringify(content));
  return content;
}
