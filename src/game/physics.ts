import { AIR_TICKS, GRAVITY, HIT_HALF, JUMP_VELOCITY, SHAPES, STEP, distanceAt } from './config.ts';

export type Shape = keyof typeof SHAPES;
export type ObstacleGeometry = { x: number; shape: Shape };
export type JumpWindow = { ideal: number; latest: number };

export function jumpHeight(ageTicks: number): number {
  if (ageTicks <= 0 || ageTicks >= AIR_TICKS) return 0;
  const age = ageTicks * STEP;
  return JUMP_VELOCITY * age - 0.5 * GRAVITY * age * age;
}

export function hitsObstacle(obstacle: ObstacleGeometry, from: number, to: number, bottom: number): boolean {
  const front = to + HIT_HALF - obstacle.x;
  const back = from - HIT_HALF - obstacle.x;
  const shape = SHAPES[obstacle.shape];
  if (front <= 0 || back >= shape.width || bottom >= shape.height) return false;

  for (const { x, width, height, spikes } of shape.parts) {
    const left = Math.max(0, back - x);
    const right = Math.min(width, front - x);
    if (right <= left || bottom >= height) continue;
    if (spikes === 0) return true;

    // The point nearest each apex is the highest part the cube can touch.
    const span = width / spikes;
    for (let i = 0; i < spikes; i += 1) {
      const apex = (i + 0.5) * span;
      const peakX = Math.max(left, Math.min(apex, right));
      const peak = height * (1 - Math.abs(peakX - apex) / (span / 2));
      if (peak > bottom) return true;
    }
  }
  return false;
}

export function canJump(obstacle: ObstacleGeometry, takeoff: number, tutorial = false): boolean {
  let before = distanceAt(takeoff, tutorial);
  if (before + HIT_HALF > obstacle.x) return false;
  for (let age = 1; age <= AIR_TICKS; age += 1) {
    const after = distanceAt(takeoff + age, tutorial);
    const bottom = Math.min(jumpHeight(age - 1), jumpHeight(age));
    if (hitsObstacle(obstacle, before, after, bottom)) return false;
    before = after;
  }
  return before - HIT_HALF >= obstacle.x + SHAPES[obstacle.shape].width;
}

export function planJump(obstacle: ObstacleGeometry, ideal: number, tutorial = false): JumpWindow | null {
  if (!canJump(obstacle, ideal, tutorial)) return null;
  let latest = ideal;
  while (canJump(obstacle, latest + 1, tutorial)) latest += 1;
  return { ideal, latest };
}
