import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR_TICKS, HZ, LANDING_BUFFER, PLAYER_X, SHAPES, STEP, TUTORIAL_WORDS, WIDTH, distanceAt,
} from '../src/game/config.ts';
import { canJump, hitsObstacle, jumpHeight, planJump } from '../src/game/physics.ts';
import { FixedClock, Run, comboMultiplier } from '../src/game/run.ts';
import { WORDS, chooseWord } from '../src/game/words.ts';

function stepTo(run: Run, tick: number) {
  while (run.tick < tick && !run.dead && !run.finished) {
    const before = run.tick;
    run.step();
    if (run.tick === before) break;
  }
}

function complete(run: Run) {
  const word = run.active!.word;
  for (const letter of word) run.type(letter);
}

test('correct input advances; errors affect accuracy without losing progress', () => {
  const run = new Run(true);
  const obstacle = run.active!;
  run.type('t');
  run.type('z');
  assert.equal(obstacle.typed, 1);
  assert.equal(run.correct, 1);
  assert.equal(run.incorrect, 1);
  assert.equal(run.accuracy, 50);
  run.type('a');
  run.type('p');
  assert.equal(obstacle.status, 'queued');
  assert.equal(run.words, 1);
  assert.equal(run.combo, 0);
  assert.equal(run.active!.word, 'jump');
  run.type('t');
  assert.equal(run.words, 1);
});

test('words cannot be changed once the run ends', () => {
  const run = new Run();
  stepTo(run, 8 * HZ);
  const correct = run.correct;
  run.type('a');
  assert.equal(run.dead, true);
  assert.equal(run.correct, correct);
});

test('jump arc has constant gravity and returns exactly to the ground', () => {
  const midpoint = Math.floor(AIR_TICKS / 2);
  const before = jumpHeight(midpoint - 1);
  const middle = jumpHeight(midpoint);
  const after = jumpHeight(midpoint + 1);
  assert.ok(middle > 150);
  assert.ok(Math.abs(after - 2 * middle + before + 1800 * STEP ** 2) < 1e-9);
  assert.equal(jumpHeight(0), 0);
  assert.equal(jumpHeight(AIR_TICKS), 0);
});

test('swept collision catches a spike crossed in one step and respects its slopes', () => {
  const spike = { x: 100, shape: 'single' } as const;
  assert.equal(hitsObstacle(spike, 0, 300, 0), true);
  assert.equal(hitsObstacle(spike, 82, 83, 12), false);
  assert.equal(hitsObstacle(spike, 113, 124, 48), false);
  assert.equal(hitsObstacle({ x: 100, shape: 'block' }, 0, 300, 89), true);
});

test('early completion queues the jump until its ideal takeoff', () => {
  const run = new Run();
  const obstacle = run.active!;
  complete(run);
  stepTo(run, obstacle.ideal);
  assert.equal(run.height, 0);
  assert.equal(obstacle.status, 'queued');
  run.step();
  assert.ok(run.height > 0);
  stepTo(run, obstacle.ideal + AIR_TICKS);
  assert.equal(obstacle.status, 'cleared');
  assert.equal(run.height, 0);
  assert.equal(run.takeoff, null);
  assert.equal(run.dead, false);
  assert.equal(run.points, 100 + 10 * obstacle.word.length);
  assert.ok(run.score > run.points);
});

test('completion on the last safe tick succeeds', () => {
  const run = new Run();
  const obstacle = run.active!;
  assert.ok(obstacle.latest > obstacle.ideal);
  stepTo(run, obstacle.latest);
  complete(run);
  stepTo(run, obstacle.latest + AIR_TICKS);
  assert.equal(obstacle.status, 'cleared');
  assert.equal(run.dead, false);
  assert.equal(canJump(obstacle, obstacle.latest + 1), false);
});

test('a missed deadline and unsafe planner candidates are rejected', () => {
  const run = new Run();
  const obstacle = run.active!;
  stepTo(run, obstacle.latest + 1);
  complete(run);
  assert.equal(obstacle.status, 'open');
  stepTo(run, obstacle.latest + AIR_TICKS);
  assert.equal(obstacle.status, 'failed');
  assert.equal(run.dead, true);
  assert.equal(planJump({ x: 10, shape: 'block' }, obstacle.ideal), null);
});

test('multiple queued jumps fire in order, with a landing between them', () => {
  const events: string[] = [];
  const run = new Run(false, (event, obstacle) => {
    if (event === 'jump') events.push(obstacle!.word);
    if (event === 'land') events.push('land');
  });
  const [first, second] = run.obstacles;
  complete(run);
  complete(run);
  stepTo(run, second.ideal + AIR_TICKS);
  assert.deepEqual(events, [first.word, 'land', second.word, 'land']);
  assert.equal(run.cleared, 2);
});

test('simulation reaches the same state at different display frame rates', () => {
  function play(fps: number) {
    const run = new Run(false, undefined, () => 0.4);
    const clock = new FixedClock();
    for (let frame = 0; frame < fps * 18; frame += 1) {
      clock.advance(1 / fps, () => {
        if (run.active) complete(run);
        run.step();
      });
    }
    return [run.tick, run.height, run.result()];
  }
  assert.deepEqual(play(30), play(60));
  assert.deepEqual(play(60), play(144));
});

test('the practice course waits indefinitely and clears all three jumps', () => {
  const run = new Run(true);
  stepTo(run, run.active!.latest);
  for (let i = 0; i < HZ * 5; i += 1) run.step();
  assert.equal(run.held, true);
  assert.equal(run.dead, false);
  for (const word of TUTORIAL_WORDS) {
    assert.equal(run.active!.word, word);
    complete(run);
  }
  stepTo(run, 30 * HZ);
  assert.equal(run.finished, true);
  assert.equal(run.cleared, 3);
});

test('generation remains clearable and spaced through all five stages', () => {
  let seed = 24;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const run = new Run(false, undefined, random);
  const seen = new Set<typeof run.obstacles[number]>();
  const shapes = new Set<string>();
  let prior: typeof run.obstacles[number] | undefined;
  for (let i = 0; i < HZ * 250; i += 1) {
    for (const obstacle of run.obstacles) {
      if (seen.has(obstacle)) continue;
      seen.add(obstacle);
      shapes.add(obstacle.shape);
      assert.ok(PLAYER_X + obstacle.x - run.distance > WIDTH);
      assert.ok(canJump(obstacle, obstacle.ideal));
      assert.ok(canJump(obstacle, obstacle.latest));
      if (prior) assert.ok(obstacle.ideal >= prior.latest + AIR_TICKS + LANDING_BUFFER);
      prior = obstacle;
    }
    if (run.active && run.tick === run.active.latest) complete(run);
    run.step();
    assert.equal(run.dead, false);
  }
  assert.equal(run.stage, 4);
  assert.deepEqual([...shapes].sort(), Object.keys(SHAPES).sort());
  assert.ok(run.cleared > 75);
  assert.ok(run.obstacles.length < 8);
  assert.ok(run.obstacles[0].x + SHAPES[run.obstacles[0].shape].width >= distanceAt(run.tick) - PLAYER_X - 40);
});

test('the dictionary is unique, lowercase, and populated at every playable length', () => {
  assert.ok(WORDS.length >= 500);
  assert.equal(WORDS.length, new Set(WORDS).size);
  assert.ok(WORDS.every((word) => /^[a-z]+$/.test(word)));
  for (let length = 3; length <= 14; length += 1) {
    assert.ok(WORDS.some((word) => word.length === length), `word length ${length}`);
  }
});

test('a depleted word length falls back to another length in the stage', () => {
  const recent = WORDS.filter((word) => word.length === 14);
  const word = chooseWord(8, 14, recent, () => 0.99);
  assert.ok(word.length >= 8 && word.length <= 13);
  assert.ok(!recent.includes(word));
});

test('score thresholds and perfect-word combo reset work', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 19, 20].map(comboMultiplier), [1, 1, 1.25, 1.25, 1.5, 1.5, 2]);
  const run = new Run();
  let boostedWord = 0;
  while (run.cleared < 5 && !run.dead) {
    if (run.active && run.words < 5) {
      boostedWord = run.active.word.length;
      complete(run);
    }
    run.step();
  }
  const boosted = run.obstacles.find((obstacle) => obstacle.multiplier === 1.25);
  assert.equal(boosted?.word.length, boostedWord);
  assert.equal(run.maxCombo, 5);
  run.type('!');
  assert.equal(run.combo, 0);
  assert.equal(run.maxCombo, 5);
});
