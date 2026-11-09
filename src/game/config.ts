export const WIDTH = 1280;
export const HEIGHT = 720;
export const GROUND = 554;
export const PLAYER_X = 309;
export const CUBE_SIZE = 44;
export const HIT_HALF = 19;
export const HZ = 120;
export const STEP = 1 / HZ;
export const GRAVITY = 1800;
export const JUMP_VELOCITY = 790;
export const AIR_TICKS = Math.ceil((2 * JUMP_VELOCITY / GRAVITY) * HZ);
export const LANDING_BUFFER = Math.ceil(0.16 * HZ);
export const COLORS = ['#69ffdd', '#79c7ff', '#a39aff', '#ff82de', '#ffb27f'];

export const SHAPES = {
  single: { width: 44, height: 48, spikes: 1, unlock: 0 },
  double: { width: 85, height: 55, spikes: 2, unlock: 1 },
  triple: { width: 126, height: 64, spikes: 3, unlock: 2 },
  block: { width: 73, height: 90, spikes: 0, unlock: 3 },
  cluster: { width: 168, height: 72, spikes: 4, unlock: 3 },
};

export const STAGES = [
  { name: 'Beginner', from: 0, speed: 300, min: 3, max: 4, wpm: 43, reaction: 0.48 },
  { name: 'Easy', from: 20, speed: 375, min: 4, max: 5, wpm: 54, reaction: 0.38 },
  { name: 'Medium', from: 45, speed: 465, min: 5, max: 7, wpm: 69, reaction: 0.31 },
  { name: 'Hard', from: 75, speed: 570, min: 6, max: 9, wpm: 84, reaction: 0.25 },
  { name: 'Insane', from: 120, speed: 680, min: 8, max: 14, wpm: 104, reaction: 0.20 },
];

export const TUTORIAL_WORDS = ['tap', 'jump', 'dash'];
export const TUTORIAL_SPEED = 245;
export const FIRST_TAKEOFF = Math.ceil(3.5 * HZ);
export const DISTANCE_PER_METER = 24;
export const DISTANCE_PER_POINT = 36;

export function stageIndex(seconds: number): number {
  for (let i = STAGES.length - 1; i > 0; i -= 1) {
    if (seconds >= STAGES[i].from) return i;
  }
  return 0;
}

// Integrate the speed curve analytically so generation can predict the same
// position the simulation will reach at a future takeoff tick.
export function distanceAt(tick: number, tutorial = false): number {
  const seconds = tick * STEP;
  if (tutorial) return seconds * TUTORIAL_SPEED;
  let distance = seconds * STAGES[0].speed;
  for (let i = 1; i < STAGES.length; i += 1) {
    const stage = STAGES[i];
    const previous = STAGES[i - 1];
    const ramp = 5;
    const elapsed = Math.max(0, seconds - stage.from);
    const fraction = Math.min(elapsed / ramp, 1);
    // Integral of smoothstep (3x² − 2x³) over the transition.
    const area = ramp * (fraction ** 3 - 0.5 * fraction ** 4) + Math.max(0, elapsed - ramp);
    distance += (stage.speed - previous.speed) * area;
  }
  const tail = Math.max(0, seconds - 125);
  return distance + 165 * (tail - 90 * -Math.expm1(-tail / 90));
}
