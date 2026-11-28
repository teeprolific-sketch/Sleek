// Builds the admin console into one self-contained HTML page: admin/dist/index.html.
// React comes from cdnjs; the console, the shared Sleek store, rules and seed data are bundled inline.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (p) => path.join(here, 'src/shims', p);

const alias = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: shim('async-storage.ts') }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: shim('react.ts') }));
    b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: shim('react-dom-client.ts') }));
  },
};

const res = await build({
  entryPoints: [path.join(here, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  write: false,
  plugins: [alias],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(path.join(here, 'src/styles.css'), 'utf8');
const html = readFileSync(path.join(here, 'index.html'), 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
mkdirSync(path.join(here, 'dist'), { recursive: true });
writeFileSync(path.join(here, 'dist/index.html'), html);
// A full document for normal web hosting (e.g. Vercel at /admin).
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${html.split('<div id="root"></div>')[0]}</head>\n<body>\n<div id="root"></div>${html.split('<div id="root"></div>')[1]}</body>\n</html>\n`;
writeFileSync(path.join(here, 'dist/standalone.html'), full);
console.log(`admin/dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
