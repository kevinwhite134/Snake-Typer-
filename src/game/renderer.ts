import { AIR_TICKS, COLORS, CUBE_SIZE, GROUND, HEIGHT, HZ, PLAYER_X, SHAPES, WIDTH, distanceAt } from './config.ts';
import type { Obstacle, Run, RunEvent } from './run.ts';
import type { Settings } from '../storage.ts';

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
const MINT = '#69ffdd';
const PINK = '#ff6fbc';
const MONO = '"Cascadia Mono", "Consolas", "Liberation Mono", monospace';

const stars = Array.from({ length: 88 }, (_, i) => ({
  x: (i * 173.87) % WIDTH, y: 70 + (i * 51.37) % 426, size: i % 11 === 0 ? 2.5 : 1.15,
  alpha: 0.18 + (i % 7) * 0.07,
}));
const towers = Array.from({ length: 25 }, (_, i) => ({
  x: i * 58, width: 23 + ((i * 31) % 36), height: 30 + ((i * 87) % 128),
}));

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: CanvasGradient;
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
    this.background = context.createLinearGradient(0, 0, 0, HEIGHT);
    this.background.addColorStop(0, '#0b0a1b');
    this.background.addColorStop(0.74, '#191039');
    this.background.addColorStop(1, '#0b0a1a');
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
    const wordX = obstacle ? this.labelX(this.screenX(obstacle, run.distance), obstacle.word) : PLAYER_X;
    const wordY = obstacle ? GROUND - SHAPES[obstacle.shape].height - 68 : GROUND;
    if (event === 'correct') this.burst(wordX, wordY, MINT, 4, 70);
    if (event === 'complete') this.burst(wordX, wordY, MINT, 16, 150);
    if (event === 'error') {
      this.shake = 0.15;
      this.burst(wordX, wordY, PINK, 5, 110);
    }
    if (event === 'land') this.burst(PLAYER_X, GROUND - 3, COLORS[run.stage], 13, 165);
    if (event === 'jump') this.burst(PLAYER_X, GROUND - 3, COLORS[run.stage], 7, 110);
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
    const color = COLORS[stage];
    ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
    this.sky(distance, color);

    ctx.save();
    if (this.settings.shake && !this.settings.reducedMotion && this.shake > 0) {
      ctx.translate(Math.sin(this.shake * 109) * this.shake * 26, Math.cos(this.shake * 139) * this.shake * 17);
    }
    this.track(distance, color);

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

  private sky(distance: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const horizon = ctx.createRadialGradient(850, 530, 15, 850, 530, 605);
    horizon.addColorStop(0, '#4c256d');
    horizon.addColorStop(0.46, '#291547');
    horizon.addColorStop(1, '#19103900');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, WIDTH, GROUND);
    for (const star of stars) {
      const x = ((star.x - distance * 0.08) % WIDTH + WIDTH) % WIDTH;
      ctx.fillStyle = `rgba(192, 178, 255, ${star.alpha})`;
      ctx.fillRect(x, star.y, star.size, star.size);
    }

    ctx.strokeStyle = '#9776e922';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < WIDTH; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); }
    for (let y = 42; y < GROUND; y += 64) { ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); }
    ctx.stroke();

    for (let i = 0; i < 2; i += 1) {
      const x = i ? 1053 : 204;
      const y = i ? 245 : 299;
      const size = i ? 101 : 74;
      ctx.save();
      ctx.translate(x, y + Math.sin(this.time + i) * 9);
      ctx.rotate(Math.PI / 4 + this.time * (i ? 0.04 : -0.07));
      ctx.strokeStyle = i ? '#a379ec43' : color + '2d';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.strokeStyle = '#9c7bea2f';
      ctx.strokeRect(-size * 0.68, -size * 0.68, size * 1.36, size * 1.36);
      ctx.restore();
    }

    for (const tower of towers) {
      const span = towers.length * 58;
      const x = ((tower.x - distance * 0.21) % span + span) % span - 48;
      const y = GROUND - tower.height;
      ctx.fillStyle = '#100d258c';
      ctx.strokeStyle = '#a383e233';
      ctx.fillRect(x, y, tower.width, tower.height);
      ctx.strokeRect(x + 0.5, y + 0.5, tower.width, tower.height);
      ctx.fillStyle = '#a785ff36';
      for (let light = y + 10; light < GROUND - 9; light += 16) ctx.fillRect(x + 8, light, 4, 2);
    }
  }

  private track(distance: number, color: string): void {
    const ctx = this.ctx;
    const floor = ctx.createLinearGradient(0, GROUND, 0, HEIGHT);
    floor.addColorStop(0, '#1c1640');
    floor.addColorStop(1, '#0b0a1c');
    ctx.fillStyle = floor;
    ctx.fillRect(-12, GROUND, WIDTH + 24, HEIGHT - GROUND + 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#9f7aff44';
    ctx.beginPath();
    const offset = distance % 80;
    for (let x = -100 - offset; x < WIDTH + 120; x += 80) {
      ctx.moveTo(x, GROUND); ctx.lineTo(640 + (x - 640) * 1.62, HEIGHT + 14);
    }
    for (const y of [574, 603, 645, 702]) {
      ctx.moveTo(-12, y); ctx.lineTo(WIDTH + 12, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 17;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(-12, GROUND - 1, WIDTH + 24, 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color + '80';
    for (let x = -offset; x < WIDTH + 12; x += 80) ctx.fillRect(x, GROUND + 3, 15, 2);
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

  private labelX(x: number, word: string): number {
    return Math.min(x, WIDTH - word.length * 10 - 32);
  }

  private obstacles(run: Run, distance: number): void {
    const active = run.active;
    const ctx = this.ctx;
    ctx.font = `700 29px ${MONO}`;
    const activeX = active ? this.labelX(this.screenX(active, distance), active.word) : -1000;
    let lastRight = -1000;
    for (const obstacle of run.obstacles) {
      const { width, height } = SHAPES[obstacle.shape];
      const x = this.screenX(obstacle, distance);
      const left = x - width / 2;
      const visible = left < WIDTH + 12 && x + width / 2 > -12;
      const armed = obstacle.status === 'queued' || obstacle.status === 'jumping' || obstacle.status === 'cleared';
      if (visible) this.shape(left, obstacle.shape, armed ? MINT : PINK, obstacle.status === 'cleared' ? 0.50 : 1);

      const half = ctx.measureText(obstacle.word).width / 2 + 16;
      const label = obstacle === active ? activeX : x;
      if (obstacle !== active) {
        if (!visible || label + half > WIDTH - 12 || label - half < 24 || label - half < lastRight + 12) continue;
        if (obstacle.status === 'cleared' || obstacle.status === 'failed') continue;
        if (active && Math.abs(label - activeX) < half + active.word.length * 9 + 26) continue;
      }
      this.word(obstacle, label, GROUND - height - 65, x, run, obstacle === active);
      lastRight = label + half;
    }
  }

  private shape(x: number, shape: Obstacle['shape'], color: string, opacity: number): void {
    const ctx = this.ctx;
    const { width, height, spikes } = SHAPES[shape];
    ctx.save();
    ctx.globalAlpha = opacity;
    const gradient = ctx.createLinearGradient(0, GROUND - height, 0, GROUND);
    gradient.addColorStop(0, color + 'a8');
    gradient.addColorStop(1, color + '29');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    if (spikes) {
      const span = width / spikes;
      for (let i = 0; i < spikes; i += 1) {
        const left = x + i * span;
        ctx.beginPath();
        ctx.moveTo(left, GROUND - 1);
        ctx.lineTo(left + span / 2, GROUND - height);
        ctx.lineTo(left + span, GROUND - 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillRect(x, GROUND - height, width, height);
      ctx.strokeRect(x, GROUND - height, width, height);
      ctx.strokeStyle = color + '7a';
      ctx.strokeRect(x + 9, GROUND - height + 9, width - 18, height - 18);
    }
    ctx.restore();
  }

  private word(obstacle: Obstacle, x: number, y: number, target: number, run: Run, active: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${active ? 29 : 24}px ${MONO}`;
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(obstacle.word).width;
    const left = x - width / 2 - 13;
    const armed = obstacle.status !== 'open';
    const recent = run.tick - obstacle.feedback < 0.19 * HZ;
    const error = recent && obstacle.flash === 'error';
    const fraction = active ? Math.max(0, Math.min(1,
      (distanceAt(obstacle.latest, run.tutorial) - run.distance) /
      Math.max(1, distanceAt(obstacle.latest, run.tutorial) - distanceAt(obstacle.opened ?? 0, run.tutorial)),
    )) : 0;
    const accent = error || (active && fraction < 0.20) ? '#ff82a8' : MINT;
    ctx.fillStyle = active ? '#0a0b1af5' : '#100e23d4';
    ctx.strokeStyle = active ? accent + 'a8' : armed ? '#62ffce75' : '#af9aea58';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.beginPath();
    ctx.roundRect(left, y - 24, width + 26, 48, 8);
    ctx.fill();
    ctx.stroke();

    let offset = left + 13;
    for (const [index, letter] of [...obstacle.word].entries()) {
      ctx.fillStyle = index < obstacle.typed ? MINT : error && index === obstacle.typed ? '#ff82a8' : active ? '#f9f6ff' : '#bbb1d4';
      if (recent && index < obstacle.typed) { ctx.shadowColor = MINT; ctx.shadowBlur = 13; }
      ctx.fillText(letter, offset, y + 1);
      ctx.shadowBlur = 0;
      offset += ctx.measureText(letter).width;
    }
    if (active) {
      ctx.fillStyle = '#9a8bbb42';
      ctx.fillRect(left + 2, y + 28, width + 22, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(left + 2, y + 28, (width + 22) * fraction, 4);
      ctx.font = `700 12px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(run.held ? 'TYPE TO CONTINUE' : fraction === 0 ? 'DEADLINE MISSED' : target > WIDTH ? '› INCOMING' : 'TYPE THIS', x, y - 37);
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
