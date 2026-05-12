import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROPS_FILE = path.join(ROOT, 'local.properties');
const TARGET_FILES = [
  path.join(ROOT, 'castletv', 'plugin.js'),
  path.join(ROOT, 'sktech', 'plugin.js'),
  path.join(ROOT, 'cricfy', 'plugin.js'),
  path.join(ROOT, 'moviebox', 'plugin.js')
  path.join(ROOT, 'layarkaca', 'plugin.js')
];

function parseProperties(content) {
  const map = new Map();
  const lines = String(content || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;

    const idxEq = line.indexOf('=');
    const idxColon = line.indexOf(':');
    let idx = -1;
    if (idxEq === -1) idx = idxColon;
    else if (idxColon === -1) idx = idxEq;
    else idx = Math.min(idxEq, idxColon);
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    map.set(key, value);
  }
  return map;
}

async function main() {
  let propText = '';
  try {
    propText = await fs.readFile(PROPS_FILE, 'utf8');
  } catch (error) {
    throw new Error('Missing local.properties. Create it before running this script.');
  }

  const props = parseProperties(propText);
  const missing = new Set();

  for (const filePath of TARGET_FILES) {
    const original = await fs.readFile(filePath, 'utf8');
    const replaced = original.replace(/__([A-Z0-9_]+)__/g, (full, key) => {
      if (!props.has(key) || !props.get(key)) {
        missing.add(key);
        return full;
      }
      return String(props.get(key));
    });

    await fs.writeFile(filePath, replaced, 'utf8');
  }

  if (missing.size > 0) {
    const ordered = Array.from(missing).sort().join(', ');
    throw new Error(`Missing required local.properties keys: ${ordered}`);
  }

  console.log('Secrets injected from local.properties successfully.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
