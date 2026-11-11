import {
  AIR_TICKS, DISTANCE_PER_METER, DISTANCE_PER_POINT, FIRST_TAKEOFF, HIT_HALF, HZ,
  LANDING_BUFFER, MISTAKE_POINTS, PLAYER_X, SHAPES, STAGES, STEP, TUTORIAL_WORDS, WIDTH, distanceAt, stageIndex,
} from './config.ts';
import { hitsObstacle, jumpHeight, planJump } from './physics.ts';
import type { JumpWindow, ObstacleGeometry, Shape } from './physics.ts';
import { chooseWord } from './words.ts';

export type Obstacle = ObstacleGeometry & JumpWindow & {
  word: string;
  typed: number;
  mistakes: number;
  opened: number | null;
  status: 'waiting' | 'open' | 'queued' | 'jumping' | 'cleared' | 'failed';
  mistakeTick: number;
  multiplier: number;
};

export type RunEvent = 'correct' | 'error' | 'complete' | 'jump' | 'land' | 'death' | 'clear' | 'finish' | 'stage';
type Feedback = (event: RunEvent, obstacle?: Obstacle) => void;

export type RunResult = {
  score: number;
  distance: number;
  time: number;
  words: number;
  correct: number;
  incorrect: number;
  cleared: number;
  accuracy: number;
  wpm: number;
  combo: number;
};

export function comboMultiplier(combo: number): number {
  if (combo >= 20) return 2;
  if (combo >= 10) return 1.5;
  if (combo >= 5) return 1.25;
  return 1;
}

export class Run {
  tick = 0;
  distance = 0;
  previousDistance = 0;
  height = 0;
  previousHeight = 0;
  takeoff: number | null = null;
  stage = 0;
  obstacles: Obstacle[] = [];
  correct = 0;
  incorrect = 0;
  cleared = 0;
  words = 0;
  combo = 0;
  maxCombo = 0;
  points = 0;
  dead = false;
  finished = false;
  held = false;
  landTick = -HZ;
  private rolling: number[] = [];
  private recent: string[] = [];
  private last: Obstacle | null = null;
  private generated = 0;
  readonly tutorial: boolean;
  private readonly emit: Feedback;
  private readonly random: () => number;

  constructor(tutorial = false, emit: Feedback = () => {}, random = Math.random) {
    this.tutorial = tutorial;
    this.emit = emit;
    this.random = random;
    this.stockObstacles();
    this.activateNext();
  }

  get active(): Obstacle | undefined {
    return this.obstacles.find((obstacle) => obstacle.status === 'open');
  }

  get queued(): Obstacle | undefined {
    return this.obstacles.find((obstacle) => obstacle.status === 'queued');
  }

  get score(): number {
    return Math.max(0, this.points + Math.floor(this.distance / DISTANCE_PER_POINT) - this.incorrect * MISTAKE_POINTS);
  }

  get accuracy(): number {
    const total = this.correct + this.incorrect;
    return total ? 100 * this.correct / total : 100;
  }

  get liveWpm(): number {
    return Math.round(12 * this.rolling.length / Math.max(2, Math.min(this.tick * STEP, 10)));
  }

  result(): RunResult {
    return {
      score: this.score,
      distance: Math.floor(this.distance / DISTANCE_PER_METER),
      time: this.tick * STEP,
      words: this.words,
      correct: this.correct,
      incorrect: this.incorrect,
      cleared: this.cleared,
      accuracy: this.accuracy,
      wpm: Math.round(12 * this.correct / Math.max(2, this.tick * STEP)),
      combo: this.maxCombo,
    };
  }

  type(key: string): void {
    const obstacle = this.active;
    if (this.dead || this.finished || !obstacle || this.tick > obstacle.latest) return;

    if (key !== obstacle.word[obstacle.typed]) {
      this.incorrect += 1;
      obstacle.mistakes += 1;
      obstacle.mistakeTick = this.tick;
      obstacle.typed = Math.max(0, obstacle.typed - 1);
      this.combo = 0;
      this.emit('error', obstacle);
      return;
    }

    this.correct += 1;
    this.rolling.push(this.tick);
    obstacle.typed += 1;
    if (obstacle.typed < obstacle.word.length) {
      this.emit('correct', obstacle);
      return;
    }

    obstacle.status = 'queued';
    this.words += 1;
    if (!obstacle.mistakes) this.combo += 1;
    this.maxCombo = Math.max(this.combo, this.maxCombo);
    obstacle.multiplier = comboMultiplier(this.combo);
    this.emit('complete', obstacle);
  }

  step(): void {
    if (this.dead || this.finished) return;
    const active = this.active;
    this.previousHeight = this.height;
    this.previousDistance = this.distance;
    this.held = this.tutorial && active !== undefined && this.tick >= active.latest;
    if (this.held) return;

    // Process inputs on the current tick before advancing past the last safe takeoff.
    const next = this.queued;
    if (this.takeoff === null && next && this.tick >= next.ideal && this.tick <= next.latest) {
      this.takeoff = this.tick;
      next.status = 'jumping';
      this.activateNext();
      this.emit('jump', next);
    }

    this.tick += 1;
    this.distance = distanceAt(this.tick, this.tutorial);
    this.height = this.takeoff === null ? 0 : jumpHeight(this.tick - this.takeoff);
    if (this.takeoff !== null && this.tick - this.takeoff >= AIR_TICKS) {
      this.takeoff = null;
      this.landTick = this.tick;
      this.emit('land');
    }

    const stage = this.tutorial ? 0 : stageIndex(this.tick * STEP);
    if (stage !== this.stage) {
      this.stage = stage;
      this.emit('stage');
    }
    while (this.rolling.length && this.rolling[0] <= this.tick - 10 * HZ) this.rolling.shift();

    const bottom = Math.min(this.height, this.previousHeight);
    for (const obstacle of this.obstacles) {
      if (obstacle.status === 'cleared') continue;
      if (hitsObstacle(obstacle, this.previousDistance, this.distance, bottom)) {
        obstacle.status = 'failed';
        this.dead = true;
        this.emit('death', obstacle);
        return;
      }
      if (obstacle.status === 'jumping' && this.distance - HIT_HALF >= obstacle.x + SHAPES[obstacle.shape].width) {
        obstacle.status = 'cleared';
        this.cleared += 1;
        this.points += Math.round((100 + obstacle.word.length * 10) * obstacle.multiplier);
        this.emit('clear', obstacle);
      }
    }

    if (this.tutorial && this.cleared === TUTORIAL_WORDS.length && this.takeoff === null) {
      this.finished = true;
      this.emit('finish');
      return;
    }

    while (this.obstacles.length && this.obstacles[0].x + SHAPES[this.obstacles[0].shape].width < this.distance - PLAYER_X - 40) {
      this.obstacles.shift();
    }
    if (!this.last || distanceAt(this.last.ideal, this.tutorial) - this.distance < WIDTH * 2) {
      this.stockObstacles();
    }
  }

  private activateNext(): void {
    const next = this.obstacles.find((obstacle) => obstacle.status === 'waiting');
    if (!next) return;
    next.status = 'open';
    next.opened = this.tick;
  }

  private stockObstacles(): void {
    if (this.tutorial && this.generated >= TUTORIAL_WORDS.length) return;
    const target = this.distance + WIDTH * 2.2;
    while (!this.last || distanceAt(this.last.ideal, this.tutorial) < target) {
      if (this.tutorial && this.generated >= TUTORIAL_WORDS.length) break;
      this.generateObstacle();
    }
  }

  private generateObstacle(): void {
    const previous = this.last;
    const earliest = previous ? previous.latest + AIR_TICKS + LANDING_BUFFER : FIRST_TAKEOFF;
    const stage = this.tutorial ? 0 : stageIndex(earliest * STEP);
    const settings = STAGES[stage];
    const word = this.tutorial ? TUTORIAL_WORDS[this.generated] : chooseWord(settings.min, settings.max, this.recent, this.random);
    const reaction = settings.reaction + word.length * 12 / settings.wpm;
    const ideal = previous ? Math.max(earliest, previous.latest + Math.ceil(reaction * HZ)) : earliest;
    const preferred = this.tutorial ? 'single' : settings.pattern[this.generated % settings.pattern.length];
    const center = distanceAt(ideal + AIR_TICKS / 2, this.tutorial);
    const createGeometry = (shape: Shape) => ({ x: center - SHAPES[shape].width / 2, shape });
    let geometry = createGeometry(preferred);
    let window = planJump(geometry, ideal, this.tutorial);
    if (!window) {
      geometry = createGeometry('single');
      window = planJump(geometry, ideal, this.tutorial);
    }
    if (!window) throw new Error('Single spikes must fit the configured jump arc.');

    this.last = {
      ...geometry, ...window, word, typed: 0, mistakes: 0, opened: null,
      status: 'waiting', mistakeTick: -HZ, multiplier: 1,
    };
    this.obstacles.push(this.last);
    this.generated += 1;
    this.recent.push(word);
    if (this.recent.length > 24) this.recent.shift();
  }
}

export class FixedClock {
  private accumulator = 0;

  advance(delta: number, step: () => void): number {
    this.accumulator += Math.min(delta, 0.15) * HZ;
    // Whole-tick boundaries may round down when split across display frames.
    while (this.accumulator >= 1 - 1e-9) {
      this.accumulator -= 1;
      step();
    }
    return Math.max(0, this.accumulator);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
