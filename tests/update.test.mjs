import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
const script = new URL('../betrieb/update.sh', import.meta.url).pathname;
const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8' });

test('Updatehilfe ist ohne Administratorrechte verfügbar', () => {
  const r = run('--help');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--check/);
  assert.match(r.stdout, /vMAJOR\.MINOR\.PATCH/);
});
test('Ein Update braucht eine feste Version und lehnt Optionen als Versionsnamen ab', () => {
  for (const args of [[], ['main'], ['-f'], ['v0.2'], ['v0.2.0', 'extra'], ['--check', 'HEAD']]) {
    const r = run(...args);
    assert.equal(r.status, 2, JSON.stringify({ args, ...r }));
    assert.match(r.stderr, /Version|Aufruf/);
  }
});
