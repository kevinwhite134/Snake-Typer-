import './styles.css';
import { ArcadeAudio } from './audio.ts';
import { FixedClock, Run } from './game/run.ts';
import type { Obstacle, RunEvent, RunResult } from './game/run.ts';
import { STAGES } from './game/config.ts';
import { Renderer } from './game/renderer.ts';
import { readSave, recordRun, resetRecords, writeSave } from './storage.ts';
import { element, instructions, menu, paused, put, results, settings, setupUi, statistics, updateHud, updateSettingsUi } from './ui.ts';
import type { State } from './ui.ts';

class Arcade {
  private state: State = 'MAIN_MENU';
  private run: Run | null = null;
  private readonly clock = new FixedClock();
  private readonly save = readSave();
  private readonly audio = new ArcadeAudio(this.save.settings);
  private readonly renderer: Renderer;
  private readonly overlay: HTMLElement;
  private suspended: State = 'PLAYING';
  private settingsReturn: State = 'MAIN_MENU';
  private countdown = 3;
  private countdownLabel = 3;
  private dying = 0;
  private alpha = 1;
  private lastTime = 0;
  private hudTime = 0;
  private toastTime = 0;
  private previousBest = 0;
  private celebratedBest = false;
  private tutorialDone = false;
  private finalRun: RunResult | null = null;

  constructor(root: HTMLElement) {
    setupUi(root);
    this.overlay = element('overlay');
    this.renderer = new Renderer(element<HTMLCanvasElement>('world'), this.save.settings);
    root.addEventListener('click', this.click);
    root.addEventListener('input', this.input);
    window.addEventListener('keydown', this.key);
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
      this.lastTime = 0;
    });
    updateSettingsUi(this.save);
    this.show('MAIN_MENU');
    requestAnimationFrame(this.frame);
  }

  private get running(): boolean {
    return this.state === 'PLAYING' || (this.state === 'TUTORIAL' && this.run !== null && !this.run.finished);
  }

  private show(state: State): void {
    this.state = state;
    const running = this.running;
    const live = running || state === 'COUNTDOWN' || state === 'DYING';
    const stage = element('stage');
    stage.dataset.state = state;
    element('hud').hidden = !live;
    element('stage-hint').hidden = !running || !this.run?.tutorial;
    element('stage-display').hidden = !live;
    const best = document.querySelector<HTMLButtonElement>('.top-score')!;
    best.disabled = state !== 'MAIN_MENU';
    const labels: Record<State, string> = {
      MAIN_MENU: 'SYSTEM READY', TUTORIAL: this.run && !this.run.finished ? 'PRACTICE RUN' : 'TRAINING',
      COUNTDOWN: 'RUN STARTING', PLAYING: 'RUN ACTIVE', PAUSED: 'RUN PAUSED', DYING: 'SIGNAL LOST',
      RESULTS: 'RUN COMPLETE', SETTINGS: 'PREFERENCES', STATISTICS: 'LOCAL RECORDS',
    };
    put('status-label', labels[state]);
    element('status-light').classList.toggle('hot', state === 'DYING' || state === 'RESULTS');

    this.overlay.classList.toggle('shade', !live && state !== 'MAIN_MENU');
    this.overlay.innerHTML = this.screen();
    this.overlay.hidden = this.overlay.innerHTML === '';
    this.audio.setPlaying(running);
    if (this.run && live) updateHud(this.run);
    if (!live || state === 'DYING') this.clearToast();

    if (this.overlay.hidden) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else if (state !== 'MAIN_MENU' && state !== 'COUNTDOWN') {
      const title = this.overlay.querySelector<HTMLElement>('h2');
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    }
  }

  private screen(): string {
    switch (this.state) {
      case 'MAIN_MENU': return menu();
      case 'TUTORIAL': return this.running ? '' : instructions(this.tutorialDone);
      case 'COUNTDOWN': return `<div class="countdown"><p class="eyebrow">GET READY</p><strong id="count">${this.countdownLabel}</strong><p>Hands on the keyboard.</p></div>`;
      case 'PAUSED': return paused();
      case 'RESULTS': return this.finalRun ? results(this.finalRun, this.previousBest) : '';
      case 'SETTINGS': return settings(this.save.settings);
      case 'STATISTICS': return statistics(this.save);
      default: return '';
    }
  }

  private start(tutorial = false, countdown = tutorial ? 1 : 3): void {
    this.audio.unlock();
    this.clock.reset();
    this.renderer.reset();
    this.clearToast();
    this.finalRun = null;
    this.tutorialDone = false;
    this.previousBest = this.save.stats.bestScore;
    this.celebratedBest = false;
    this.run = new Run(tutorial, this.feedback);
    this.alpha = 1;
    this.countdown = countdown;
    this.countdownLabel = this.countdown;
    if (!countdown) {
      this.show(tutorial ? 'TUTORIAL' : 'PLAYING');
      return;
    }
    this.audio.cue('tick');
    this.show('COUNTDOWN');
  }

  private home(): void {
    this.run = null;
    this.tutorialDone = false;
    this.renderer.reset();
    this.show('MAIN_MENU');
  }

  private autoPause(): void {
    if (!this.running && this.state !== 'COUNTDOWN') return;
    this.suspended = this.state;
    this.clock.reset();
    this.alpha = 1;
    this.show('PAUSED');
  }

  private resume(): void {
    this.lastTime = 0;
    this.audio.unlock();
    this.show(this.suspended);
  }

  private feedback = (event: RunEvent, obstacle?: Obstacle): void => {
    const run = this.run!;
    this.renderer.effect(event, run, obstacle);
    switch (event) {
      case 'correct':
      case 'error':
      case 'jump':
      case 'land':
        this.audio.cue(event);
        break;
      case 'complete':
        this.audio.cue('complete');
        if (!run.tutorial && run.combo > 0 && run.combo % 10 === 0) this.announce(`${run.combo} PERFECT COMBO!`);
        break;
      case 'stage':
        this.audio.cue('stage');
        this.announce(`${STAGES[run.stage].name.toUpperCase()} MODE`);
        break;
      case 'clear':
        if (!run.tutorial && this.previousBest > 0 && !this.celebratedBest && run.score > this.previousBest) {
          this.celebratedBest = true;
          this.announce('NEW HIGH SCORE!');
          this.audio.cue('record');
        }
        break;
      case 'finish':
        this.tutorialDone = true;
        this.audio.cue('record');
        this.show('TUTORIAL');
        break;
      case 'death':
        this.finalRun = run.result();
        recordRun(this.save, this.finalRun);
        this.persist();
        this.audio.cue('death');
        this.dying = this.save.settings.reducedMotion ? 0.24 : 0.68;
        this.show('DYING');
        break;
    }
  };

  private announce(message: string): void {
    put('announcement', message);
    element('announcement').hidden = false;
    this.toastTime = 1.65;
  }

  private clearToast(): void {
    element('announcement').hidden = true;
    this.toastTime = 0;
  }

  private persist(): void {
    writeSave(this.save);
    this.audio.update();
    updateSettingsUi(this.save);
  }

  private askReset(all: boolean): void {
    const dialog = element<HTMLDialogElement>('reset-dialog');
    dialog.returnValue = '';
    put('reset-title', all ? 'Reset all statistics?' : 'Reset high scores?');
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'reset') return;
      resetRecords(this.save, all);
      this.persist();
    }, { once: true });
    dialog.showModal();
  }

  private click = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    this.audio.unlock();
    this.audio.cue('menu');
    switch (button.dataset.action) {
      case 'play': this.start(false, this.state === 'RESULTS' ? 0 : 3); break;
      case 'practice': this.start(true); break;
      case 'restart': this.start(this.run?.tutorial, 0); break;
      case 'how': this.show('TUTORIAL'); break;
      case 'pause': this.autoPause(); break;
      case 'resume': this.resume(); break;
      case 'home': this.home(); break;
      case 'stats': this.show('STATISTICS'); break;
      case 'back':
        if (this.state === 'SETTINGS' && this.settingsReturn === 'PAUSED') this.show('PAUSED');
        else this.home();
        break;
      case 'settings':
        this.settingsReturn = this.state;
        this.show('SETTINGS');
        break;
      case 'mute': {
        const s = this.save.settings;
        s.muted = !s.muted;
        const toggle = document.querySelector<HTMLInputElement>('input[data-setting="muted"]');
        if (toggle) toggle.checked = s.muted;
        this.persist();
        break;
      }
      case 'reset-scores': this.askReset(false); break;
      case 'reset-all': this.askReset(true); break;
    }
  };

  private input = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const input = event.target;
    const s = this.save.settings;
    const key = input.dataset.setting;
    if (key === 'master' || key === 'music' || key === 'effects') {
      s[key] = input.valueAsNumber / 100;
      const output = input.nextElementSibling;
      if (output) output.textContent = `${input.value}%`;
    } else if (key === 'muted' || key === 'particles' || key === 'shake' || key === 'reducedMotion'
      || key === 'wpm' || key === 'accuracy' || key === 'combo') {
      s[key] = input.checked;
    } else return;
    this.audio.unlock();
    this.persist();
  };

  private key = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.repeat) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      if (this.running || this.state === 'COUNTDOWN') this.autoPause();
      else if (this.state === 'PAUSED') this.resume();
      else if (this.state === 'SETTINGS' && this.settingsReturn === 'PAUSED') this.show('PAUSED');
      else if (['SETTINGS', 'STATISTICS', 'TUTORIAL'].includes(this.state)) this.home();
      else return;
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement) &&
      (this.state === 'RESULTS' || this.state === 'MAIN_MENU')) {
      event.preventDefault();
      this.start(false, this.state === 'RESULTS' ? 0 : 3);
      return;
    }
    if (!this.running || !this.run) return;
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      this.run.type(event.key.toLowerCase());
      updateHud(this.run);
    } else if ([' ', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      if (event.key !== ' ' || !(event.target instanceof HTMLButtonElement)) event.preventDefault();
    }
  };

  private frame = (now: number): void => {
    const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.15) : 0;
    this.lastTime = now;

    if (this.state === 'COUNTDOWN') {
      this.countdown -= delta;
      if (this.countdown <= 0) {
        this.show(this.run?.tutorial ? 'TUTORIAL' : 'PLAYING');
      } else if (Math.ceil(this.countdown) !== this.countdownLabel) {
        this.countdownLabel = Math.ceil(this.countdown);
        put('count', String(this.countdownLabel));
        this.audio.cue('tick');
      }
    } else if (this.running && this.run) {
      this.alpha = this.clock.advance(delta, () => this.run?.step());
      this.hudTime += delta;
      if (this.hudTime > 0.085) {
        this.hudTime = 0;
        updateHud(this.run);
      }
      this.toastTime -= delta;
      if (this.toastTime <= 0 && !element('announcement').hidden) this.clearToast();
    } else if (this.state === 'DYING') {
      this.dying -= delta;
      if (this.dying <= 0) {
        if (this.finalRun && this.finalRun.score > this.previousBest && !this.celebratedBest) this.audio.cue('record');
        this.show('RESULTS');
      }
    }

    const showRun = this.state !== 'MAIN_MENU' && this.state !== 'STATISTICS';
    this.renderer.draw(showRun ? this.run : null, delta, this.alpha, this.running && !this.run?.held, this.state === 'DYING');
    this.audio.frame();
    requestAnimationFrame(this.frame);
  };
}

new Arcade(element('app'));
