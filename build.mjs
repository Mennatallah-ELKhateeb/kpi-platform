// Build script. `npm run build` -> dist/ ; `npm run dev` -> watch + local server.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { context, build } from 'esbuild';
import { ROOT, writeGenerated } from './lib.mjs';

const dev = process.argv.includes('--serve');
if (process.argv.includes('--gen')) { writeGenerated(); console.log('Generated src/generated/content.json'); process.exit(0); }
const dist = path.join(ROOT, 'dist');

writeGenerated();
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const copyPublic = () => {
  const pub = path.join(ROOT, 'public');
  for (const f of fs.readdirSync(pub)) fs.copyFileSync(path.join(pub, f), path.join(dist, f));
};
copyPublic();

const options = {
  entryPoints: { app: path.join(ROOT, 'src/main.tsx') },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  legalComments: 'none',
  charset: 'utf8', // keep Arabic text as UTF-8 instead of \uXXXX escapes (roughly halves the bundle)
  logLevel: 'info',
  metafile: true,
};

if (dev) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 4173 });
  console.log(`Dev server: http://localhost:${port}`);
} else {
  const r = await build(options);
  const sizes = Object.entries(r.metafile.outputs).map(([f, o]) => {
    const gz = zlib.gzipSync(fs.readFileSync(f)).length;
    return `${path.basename(f)} ${(o.bytes / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB gzip)`;
  });
  console.log(`Built dist/: ${sizes.join(', ')}`);
}
