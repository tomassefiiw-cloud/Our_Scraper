/**
 * Postinstall script — copies sql.js's WASM file into /public so it can
 * be served statically by Next.js. The browser needs this file at runtime
 * to initialize SQLite.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// sql.js publishes its wasm file at sql.js/dist/sql-wasm.wasm
const sourceCandidates = [
  resolve(projectRoot, 'node_modules/sql.js/dist/sql-wasm.wasm'),
  resolve(projectRoot, 'node_modules/.pnpm/sql.js@1.10.3/node_modules/sql.js/dist/sql-wasm.wasm'),
];

const destDir = resolve(projectRoot, 'public');
const destFile = resolve(destDir, 'sql-wasm.wasm');

mkdirSync(destDir, { recursive: true });

let copied = false;
for (const src of sourceCandidates) {
  if (existsSync(src)) {
    copyFileSync(src, destFile);
    console.log(`[postinstall] copied sql-wasm.wasm from ${src} -> ${destFile}`);
    copied = true;
    break;
  }
}

if (!copied) {
  console.warn(
    '[postinstall] WARNING: sql-wasm.wasm not found in node_modules. ' +
      'Run `npm install sql.js` first, then `npm run postinstall`.',
  );
}
