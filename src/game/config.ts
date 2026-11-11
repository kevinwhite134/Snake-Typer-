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
export const MISTAKE_POINTS = 25;

type ShapePart = { width: number; height: number; spikes: number };

function formation(...parts: ShapePart[]) {
  let width = 0;
  const positioned = parts.map((part) => {
    const x = width;
    width += part.width;
    return { ...part, x };
  });
  return { width, height: Math.max(...parts.map((part) => part.height)), parts: positioned };
}

export const SHAPES = {
  single: formation({ width: 44, height: 48, spikes: 1 }),
  double: formation({ width: 85, height: 55, spikes: 2 }),
  triple: formation({ width: 126, height: 64, spikes: 3 }),
  block: formation({ width: 73, height: 90, spikes: 0 }),
  cluster: formation({ width: 168, height: 72, spikes: 4 }),
  steps: formation(
    { width: 35, height: 42, spikes: 0 },
    { width: 42, height: 77, spikes: 0 },
    { width: 35, height: 42, spikes: 0 },
  ),
  fortress: formation(
    { width: 52, height: 52, spikes: 1 },
    { width: 64, height: 110, spikes: 0 },
    { width: 52, height: 52, spikes: 1 },
  ),
};

export const STAGES = [
  {
    name: 'Beginner', course: 'Neon Circuit', color: '#69ffdd', from: 0, speed: 300, min: 3, max: 4, wpm: 43, reaction: 0.48,
    pattern: ['single', 'double', 'single', 'double', 'double'],
  },
  {
    name: 'Easy', course: 'Voltage Vault', color: '#79c7ff', from: 20, speed: 375, min: 4, max: 5, wpm: 54, reaction: 0.38,
    pattern: ['double', 'steps', 'double', 'single', 'steps'],
  },
  {
    name: 'Medium', course: 'Prism Works', color: '#ba9bff', from: 45, speed: 465, min: 5, max: 7, wpm: 69, reaction: 0.31,
    pattern: ['steps', 'triple', 'block', 'double', 'triple'],
  },
  {
    name: 'Hard', course: 'Pulse Foundry', color: '#ff82de', from: 75, speed: 570, min: 6, max: 9, wpm: 84, reaction: 0.25,
    pattern: ['cluster', 'block', 'fortress', 'steps', 'triple'],
  },
  {
    name: 'Insane', course: 'Solar Core', color: '#ffba7f', from: 120, speed: 680, min: 8, max: 14, wpm: 104, reaction: 0.20,
    pattern: ['fortress', 'cluster', 'steps', 'fortress', 'triple', 'block'],
  },
] as const satisfies ReadonlyArray<{
  name: string; course: string; color: string; from: number; speed: number;
  min: number; max: number; wpm: number; reaction: number; pattern: ReadonlyArray<keyof typeof SHAPES>;
}>;

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
