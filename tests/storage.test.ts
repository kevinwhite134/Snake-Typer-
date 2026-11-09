import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, readSave, recordRun, resetRecords, writeSave } from '../src/storage.ts';
import type { RunResult } from '../src/game/run.ts';

const example: RunResult = {
  score: 2400, time: 31, distance: 115, words: 16,
  wpm: 61, accuracy: 96, combo: 5, correct: 75, incorrect: 3, cleared: 15,
};

test('local stats and a sorted, capped leaderboard survive reload', () => {
  const values = new Map<string, string>();
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const save = readSave(store);
  save.settings.effects = 0.42;
  for (let i = 0; i < 12; i += 1) recordRun(save, { ...example, score: i + 2400 });
  assert.equal(save.stats.bestAccuracy, 0);
  recordRun(save, { ...example, words: 20 });
  writeSave(save, store);
  const loaded = readSave(store);
  assert.deepEqual(loaded, save);
  assert.equal(loaded.stats.bestAccuracy, 96);
  assert.equal(loaded.stats.bestScore, 2411);
  assert.equal(loaded.stats.games, 13);
  assert.equal(loaded.entries.length, 10);
  assert.equal(loaded.entries[0].score, 2411);
});

test('invalid saves and blocked storage safely fall back to defaults', () => {
  assert.equal(readSave({ getItem: () => 'bad json' }).stats.bestScore, 0);
  assert.equal(readSave({ getItem: () => '{ "version": 2 }' }).version, 1);
  const save = readSave({ getItem: () => JSON.stringify({
    version: 1, stats: { games: -1, bestScore: 'hello', bestAccuracy: 120 }, settings: { master: 2, particles: 'true' },
    entries: [{ date: 'invalid', score: 1 }, { date: '2026-01-01', score: 7, accuracy: 101 }],
  }) });
  assert.equal(save.settings.master, 1);
  assert.equal(save.settings.particles, DEFAULTS.particles);
  assert.equal(save.stats.games, 0);
  assert.equal(save.stats.bestScore, 0);
  assert.equal(save.stats.bestAccuracy, 100);
  assert.equal(save.entries.length, 1);
  assert.equal(save.entries[0].accuracy, 100);
  assert.doesNotThrow(() => writeSave(save, { setItem: () => { throw new Error('blocked'); } }));
});

test('score reset preserves lifetime totals and full reset preserves preferences', () => {
  const save = readSave({ getItem: () => null });
  save.settings.muted = true;
  recordRun(save, example);
  resetRecords(save, false);
  assert.equal(save.stats.bestScore, 0);
  assert.equal(save.stats.games, 1);
  assert.equal(save.entries.length, 0);
  resetRecords(save, true);
  assert.equal(save.stats.games, 0);
  assert.equal(save.settings.muted, true);
});
