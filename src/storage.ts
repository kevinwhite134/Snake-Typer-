import type { RunResult } from './game/run.ts';

export const SAVE_KEY = 'type-dash:v1';
export const DEFAULTS = {
  master: 0.7, music: 0.22, effects: 0.75, muted: false,
  particles: true, shake: true, reducedMotion: false,
  wpm: true, accuracy: true, combo: true,
};

export type Settings = typeof DEFAULTS;
export type Entry = Pick<RunResult, 'score' | 'wpm' | 'accuracy' | 'time'> & { date: string };
const EMPTY_STATS = {
  games: 0, words: 0, correct: 0, incorrect: 0, cleared: 0, time: 0,
  bestScore: 0, bestWpm: 0, bestAccuracy: 0, bestCombo: 0,
};
export type Save = { version: 1; settings: Settings; stats: typeof EMPTY_STATS; entries: Entry[] };

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback = 0, limit = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, limit) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function storage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readSave(store: Pick<Storage, 'getItem'> | undefined = storage()): Save {
  const save: Save = { version: 1, settings: { ...DEFAULTS }, stats: { ...EMPTY_STATS }, entries: [] };
  if (typeof matchMedia === 'function') save.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const data = object(JSON.parse(store?.getItem(SAVE_KEY) ?? 'null'));
    if (data.version !== 1) return save;
    const settings = object(data.settings);
    for (const key of ['master', 'music', 'effects'] as const) save.settings[key] = number(settings[key], DEFAULTS[key], 1);
    for (const key of ['muted', 'particles', 'shake', 'reducedMotion', 'wpm', 'accuracy', 'combo'] as const) {
      save.settings[key] = flag(settings[key], save.settings[key]);
    }
    const stats = object(data.stats);
    for (const key of Object.keys(EMPTY_STATS) as (keyof typeof EMPTY_STATS)[]) {
      const value = number(stats[key], 0, key === 'bestAccuracy' ? 100 : undefined);
      save.stats[key] = key === 'time' || key === 'bestAccuracy' ? value : Math.floor(value);
    }
    if (Array.isArray(data.entries)) {
      const entries: Entry[] = [];
      for (const item of data.entries) {
        const entry = object(item);
        if (typeof entry.date !== 'string' || !Number.isFinite(Date.parse(entry.date))) continue;
        if (typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0) continue;
        entries.push({
          date: new Date(entry.date).toISOString(), score: Math.floor(number(entry.score)),
          wpm: Math.round(number(entry.wpm)), accuracy: number(entry.accuracy, 0, 100), time: number(entry.time),
        });
      }
      save.entries = entries.sort((a, b) => b.score - a.score).slice(0, 10);
    }
  } catch {
    // Private browsing, invalid JSON, and unavailable storage use defaults.
  }
  return save;
}

export function writeSave(save: Save, store: Pick<Storage, 'setItem'> | undefined = storage()): void {
  try { store?.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* Keep the in-memory session usable. */ }
}

export function recordRun(save: Save, run: RunResult, date = new Date()): void {
  const { stats } = save;
  stats.games += 1;
  stats.words += run.words;
  stats.correct += run.correct;
  stats.incorrect += run.incorrect;
  stats.cleared += run.cleared;
  stats.time += run.time;
  stats.bestScore = Math.max(stats.bestScore, run.score);
  stats.bestWpm = Math.max(stats.bestWpm, run.wpm);
  stats.bestCombo = Math.max(stats.bestCombo, run.combo);
  if (run.words >= 20) stats.bestAccuracy = Math.max(stats.bestAccuracy, run.accuracy);
  const { score, wpm, accuracy, time } = run;
  save.entries = [...save.entries, { score, wpm, accuracy, time, date: date.toISOString() }]
    .sort((a, b) => b.score - a.score).slice(0, 10);
}

export function resetRecords(save: Save, all: boolean): void {
  save.entries = [];
  if (all) save.stats = { ...EMPTY_STATS };
  else save.stats.bestScore = 0;
}
