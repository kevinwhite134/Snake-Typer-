import { AIR_TICKS, CUBE_SIZE, GROUND, HEIGHT, HZ, PLAYER_X, SHAPES, STAGES, WIDTH } from './config.ts';
import type { Obstacle, Run, RunEvent } from './run.ts';
import type { Settings } from '../storage.ts';

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
const MINT = '#69ffdd';
const PINK = '#ff6fbc';
const THEMES = [
  { top: '#081126', sky: '#162d4d', floor: '#13293c', trim: '#477cc7', skyline: [38, 68, 108, 68, 38] },
  { top: '#070e27', sky: '#183c70', floor: '#112b52', trim: '#4d8ded', skyline: [90, 155, 70, 155, 90] },
  { top: '#160d32', sky: '#3a215a', floor: '#2a1948', trim: '#9b6de5', skyline: [56, 106, 152, 186, 124] },
  { top: '#200b27', sky: '#502248', floor: '#3b163f', trim: '#db6ab2', skyline: [160, 115, 60, 115, 160] },
  { top: '#21101a', sky: '#603022', floor: '#47251f', trim: '#ed935e', skyline: [128, 174, 210, 174, 128] },
];

const stars = Array.from({ length: 88 }, (_, i) => ({
  x: (i * 173.87) % WIDTH, y: 70 + (i * 51.37) % 426, size: i % 11 === 0 ? 2.5 : 1.15,
  alpha: 0.18 + (i % 7) * 0.07,
}));
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly backgrounds: CanvasGradient[];
  private particles: Spark[] = [];
  private shake = 0;
  private impact = 0;
  private time = 0;
  private trail: { height: number; rotation: number }[] = [];
  private trailTimer = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly settings: Settings) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    this.ctx = context;
    this.backgrounds = THEMES.map(({ top, sky }) => {
      const gradient = context.createLinearGradient(0, 0, 0, GROUND);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, sky);
      return gradient;
    });
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas);
    this.resize();
  }

  reset(): void {
    this.particles = [];
    this.trail = [];
    this.shake = 0;
    this.impact = 0;
    this.trailTimer = 0;
  }

  effect(event: RunEvent, run: Run, obstacle?: Obstacle): void {
    const targetX = obstacle ? this.screenX(obstacle, run.distance) : PLAYER_X;
    const targetY = obstacle ? GROUND - SHAPES[obstacle.shape].height - 28 : GROUND;
    const color = STAGES[run.stage].color;
    if (event === 'complete') this.burst(targetX, targetY, MINT, 16, 150);
    if (event === 'error') {
      this.shake = 0.15;
      this.burst(PLAYER_X, GROUND - run.height - CUBE_SIZE / 2, PINK, 8, 110);
    }
    if (event === 'land') this.burst(PLAYER_X, GROUND - 3, color, 13, 165);
    if (event === 'jump') this.burst(PLAYER_X, GROUND - 3, color, 7, 110);
    if (event === 'death') {
      this.impact = 0.38;
      this.shake = 0.32;
      this.burst(PLAYER_X, GROUND - run.height - CUBE_SIZE / 2, PINK, 43, 345);
    }
  }

  draw(run: Run | null, delta: number, alpha: number, moving: boolean, dying: boolean): void {
    const ctx = this.ctx;
    if (!this.settings.reducedMotion && (moving || dying || !run)) this.time += delta;
    const distance = run ? run.previousDistance + (run.distance - run.previousDistance) * alpha : this.time * 37;
    const stage = run?.stage ?? 0;
    const color = STAGES[stage].color;
    ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
    this.sky(distance, stage);

    ctx.save();
    if (this.settings.shake && !this.settings.reducedMotion && this.shake > 0) {
      ctx.translate(Math.sin(this.shake * 109) * this.shake * 26, Math.cos(this.shake * 139) * this.shake * 17);
    }
    this.track(distance, stage);

    if (run) {
      const height = run.previousHeight + (run.height - run.previousHeight) * alpha;
      const rotation = run.takeoff === null ? 0 : Math.min(1, (run.tick - run.takeoff + alpha) / AIR_TICKS) * Math.PI / 2;
      this.obstacles(run, distance);
      if (!run.dead) {
        if (moving && this.settings.particles && !this.settings.reducedMotion) {
          this.trailTimer += delta;
          if (this.trailTimer > 0.024) {
            this.trail.unshift({ height, rotation });
            this.trail.length = Math.min(this.trail.length, 7);
            this.trailTimer = 0;
          }
        }
        if (this.settings.particles && !this.settings.reducedMotion) {
          for (let i = this.trail.length - 1; i >= 0; i -= 1) {
            const trail = this.trail[i];
            this.cube(PLAYER_X - (i + 1) * 11, trail.height, trail.rotation, color, (7 - i) * 0.029);
          }
        }
        const sinceLand = (run.tick - run.landTick) / HZ;
        const squash = this.settings.reducedMotion ? 0 : 0.13 * Math.max(0, 1 - sinceLand / 0.14);
        this.cube(PLAYER_X, height, rotation, color, 1, squash);
      }
    } else {
      const bob = this.settings.reducedMotion ? 0 : Math.max(0, Math.sin(this.time * 2.2)) ** 5 * 47;
      this.cube(PLAYER_X - 120, bob, bob * 0.025, MINT, 1);
      this.shape(982, 'double', '#f58fda', 0.78);
      this.shape(1138, 'single', '#bc9cff', 0.64);
      this.shape(764, 'single', '#aa8bff', 0.35);
    }

    if (moving || dying || !run) {
      const effectsDelta = dying ? delta * 0.62 : delta;
      this.shake = Math.max(0, this.shake - delta);
      this.impact = Math.max(0, this.impact - delta);
      this.updateParticles(effectsDelta);
    }
    if (this.settings.particles) this.paintParticles();
    ctx.restore();

    if (this.impact && !this.settings.reducedMotion) {
      ctx.fillStyle = `rgba(255, 55, 121, ${this.impact * 0.67})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  private resize(): void {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const box = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(box.width * ratio));
    this.canvas.height = Math.max(1, Math.round(box.height * ratio));
  }

  private sky(distance: number, stage: number): void {
    const ctx = this.ctx;
    const { color } = STAGES[stage];
    const { top, trim, skyline } = THEMES[stage];
    ctx.fillStyle = this.backgrounds[stage];
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const horizon = ctx.createRadialGradient(900, 536, 12, 900, 536, 680);
    horizon.addColorStop(0, trim + '68');
    horizon.addColorStop(1, trim + '00');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, WIDTH, GROUND);
    for (const star of stars) {
      const x = ((star.x - distance * 0.08) % WIDTH + WIDTH) % WIDTH;
      ctx.fillStyle = `rgba(192, 178, 255, ${star.alpha})`;
      ctx.fillRect(x, star.y, star.size, star.size);
    }

    ctx.strokeStyle = trim + '31';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -(distance * 0.14 % 64); x < WIDTH; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); }
    for (let y = 42; y < GROUND; y += 64) { ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); }
    ctx.stroke();

    // Rotating background rings are separate from the bright, grounded hazards.
    for (let i = 0; i < 3; i += 1) {
      const span = 1584;
      const x = (span + (220 + i * 528 - distance * 0.11) % span) % span - 132;
      const y = 235 + ((i + stage) % 3) * 64;
      const sides = 4 + 2 * stage;
      const radius = 44 + (i % 2) * 18;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4 + this.time * (i % 2 ? 0.11 : -0.08));
      ctx.strokeStyle = color + '3b';
      ctx.fillStyle = trim + '17';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let point = 0; point < sides; point += 1) {
        const angle = point * Math.PI * 2 / sides;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const stride = 64;
    const span = stride * skyline.length;
    for (let start = -(distance * 0.29 % span) - span; start < WIDTH; start += span) {
      for (const [i, height] of skyline.entries()) {
        const x = start + i * stride;
        const y = GROUND - height;
        ctx.fillStyle = top + 'de';
        ctx.strokeStyle = trim + '5b';
        ctx.fillRect(x, y, stride - 5, height);
        ctx.strokeRect(x + 0.5, y + 0.5, stride - 6, height);
        ctx.fillStyle = color + '48';
        ctx.fillRect(x + 5, y + 5, stride - 15, 2);
        for (let panel = y + 16; panel < GROUND - 20; panel += 26) {
          ctx.strokeRect(x + 7, panel, stride - 19, 17);
          ctx.fillRect(x + 12, panel + 5, 10, 2);
        }
      }
    }
  }

  private track(distance: number, stage: number): void {
    const ctx = this.ctx;
    const { color } = STAGES[stage];
    const { floor: tile, top, trim } = THEMES[stage];
    const floor = ctx.createLinearGradient(0, GROUND, 0, HEIGHT);
    floor.addColorStop(0, tile);
    floor.addColorStop(1, top);
    ctx.fillStyle = floor;
    ctx.fillRect(-12, GROUND, WIDTH + 24, HEIGHT - GROUND + 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = trim + '65';
    ctx.beginPath();
    const offset = distance % 96;
    for (let x = -100 - offset; x < WIDTH + 120; x += 96) {
      ctx.moveTo(x, GROUND); ctx.lineTo(640 + (x - 640) * 1.62, HEIGHT + 14);
    }
    for (const y of [597, 639, 697]) {
      ctx.moveTo(-12, y); ctx.lineTo(WIDTH + 12, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 17;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(-12, GROUND - 1, WIDTH + 24, 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color + '65';
    ctx.fillStyle = trim + '63';
    for (let x = -96 - offset; x < WIDTH + 12; x += 96) {
      ctx.strokeRect(x + 4, GROUND + 7, 88, 25);
      ctx.fillRect(x + 11, GROUND + 13, 4, 4);
      ctx.fillRect(x + 81, GROUND + 22, 4, 4);
      ctx.beginPath();
      ctx.moveTo(x + 39, GROUND + 13);
      ctx.lineTo(x + 48, GROUND + 20);
      ctx.lineTo(x + 39, GROUND + 27);
      ctx.moveTo(x + 49, GROUND + 13);
      ctx.lineTo(x + 58, GROUND + 20);
      ctx.lineTo(x + 49, GROUND + 27);
      ctx.stroke();
    }
  }

  private cube(x: number, height: number, angle: number, color: string, opacity: number, squash = 0): void {
    const ctx = this.ctx;
    const half = CUBE_SIZE / 2;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, GROUND - height - half * (1 - squash) - 2);
    ctx.rotate(angle);
    ctx.scale(1 + squash, 1 - squash);
    ctx.shadowColor = color;
    ctx.shadowBlur = opacity === 1 ? 23 : 0;
    ctx.fillStyle = '#233b49';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fillRect(-half, -half, CUBE_SIZE, CUBE_SIZE);
    ctx.strokeRect(-half, -half, CUBE_SIZE, CUBE_SIZE);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color + '59';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-half + 6, -half + 6, CUBE_SIZE - 12, CUBE_SIZE - 12);
    ctx.fillStyle = '#eafff8';
    ctx.fillRect(-10, -4, 5, 8);
    ctx.fillRect(6, -4, 5, 8);
    ctx.restore();
  }

  private screenX(obstacle: Obstacle, distance: number): number {
    return PLAYER_X + obstacle.x + SHAPES[obstacle.shape].width / 2 - distance;
  }

  private obstacles(run: Run, distance: number): void {
    const ctx = this.ctx;
    for (const obstacle of run.obstacles) {
      const { width, height } = SHAPES[obstacle.shape];
      const x = this.screenX(obstacle, distance);
      const left = x - width / 2;
      if (left > WIDTH + 12 || x + width / 2 < -12) continue;
      const armed = obstacle.status === 'queued' || obstacle.status === 'jumping' || obstacle.status === 'cleared';
      const waiting = obstacle.status === 'waiting';
      this.shape(left, obstacle.shape, armed ? MINT : PINK, waiting || obstacle.status === 'cleared' ? 0.58 : 1);

      const y = GROUND - height - 27;
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 2.5;
      if (obstacle.status === 'open') {
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x + 8, y - 4);
        ctx.stroke();
      } else if (obstacle.status === 'queued') {
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 2, y + 5);
        ctx.lineTo(x + 8, y - 5);
        ctx.stroke();
      }
    }
  }

  private shape(x: number, shape: Obstacle['shape'], color: string, opacity: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;
    for (const part of SHAPES[shape].parts) {
      const { width, height, spikes } = part;
      const left = x + part.x;
      const top = GROUND - height;
      const gradient = ctx.createLinearGradient(0, top, 0, GROUND);
      gradient.addColorStop(0, color + 'bd');
      gradient.addColorStop(1, '#0b1020');
      ctx.fillStyle = gradient;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      if (spikes) {
        const span = width / spikes;
        for (let i = 0; i < spikes; i += 1) {
          const start = left + i * span;
          ctx.beginPath();
          ctx.moveTo(start, GROUND - 1);
          ctx.lineTo(start + span / 2, top);
          ctx.lineTo(start + span, GROUND - 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else {
        ctx.fillRect(left, top, width, height);
        ctx.strokeRect(left, top, width, height);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color + 'a8';
        ctx.strokeRect(left + 6, top + 7, width - 12, height - 14);
        ctx.fillStyle = color;
        ctx.fillRect(left + 7, top + 8, width - 14, 3);
      }
    }
    ctx.restore();
  }

  private burst(x: number, y: number, color: string, count: number, speed: number): void {
    if (!this.settings.particles || this.settings.reducedMotion) return;
    for (let i = 0; i < count && this.particles.length < 220; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.25 + Math.random() * 0.75);
      const life = 0.15 + Math.random() * (count > 30 ? 0.8 : 0.30);
      this.particles.push({
        x, y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power - 44,
        life, max: life, size: 2 + Math.random() * (count > 30 ? 9 : 4), color,
      });
    }
  }

  private updateParticles(delta: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      } else {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vy += 325 * delta;
      }
    }
  }

  private paintParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.restore();
  }
}
