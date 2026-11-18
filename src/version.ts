import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (manifest.version !== packageInfo.version) throw new Error('Release und Paketversion stimmen nicht überein.');
export const release = Object.freeze({
  version: String(manifest.version),
  apiVersion: Number(manifest.apiVersion),
  schemaVersion: Number(manifest.schemaVersion),
});
