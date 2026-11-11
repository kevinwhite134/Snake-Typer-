import { HZ, MISTAKE_POINTS, STAGES } from './game/config.ts';
import type { Run, RunResult } from './game/run.ts';
import type { Save, Settings } from './storage.ts';

export type State = 'MAIN_MENU' | 'TUTORIAL' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'DYING' | 'RESULTS' | 'SETTINGS' | 'STATISTICS';
const glyphs = {
  play: '<path d="m8 5 12 7-12 7z" fill="currentColor" stroke-linejoin="round"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 14h.01m3 0h7"/>',
  settings: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
  stats: '<path d="M4 19h16M7 15v-4m5 4V6m5 9V8"/>',
  sound: '<path d="M3 10v4h4l5 4V6l-5 4zm13-1a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  muted: '<path d="M3 10v4h4l5 4V6l-5 4zm13 0 4 4m0-4-4 4"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 1h8"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  pause: '<path d="M9 6v12m6-12v12" stroke-width="3"/>',
  retry: '<path d="M4 11a8 8 0 1 1 2 7m-2-7V5m0 6h6"/>',
  cube: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 11v3m6-3v3" stroke-width="2.5"/>',
};

function icon(name: keyof typeof glyphs): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;
}

const fmt = new Intl.NumberFormat();
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const pct = (n: number) => `${Math.round(n)}%`;
const elapsed = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
};
const stat = (label: string, value: string | number) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
const back = () => `<button class="back" data-action="back">${icon('back')} Back</button>`;

export function setupUi(root: HTMLElement): void {
  root.innerHTML = `
    <main class="cabinet">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">${icon('cube')}</div><div>TYPE<span>DASH</span><small>TYPING ARCADE</small></div></div>
        <div class="top-actions">
          <button class="top-score" data-action="stats" title="View statistics">
            ${icon('trophy')} <span>PERSONAL BEST<strong id="best">0</strong></span>
          </button>
          <button class="icon-btn" data-action="mute" id="mute" aria-label="Mute audio">${icon('sound')}</button>
        </div>
      </header>
      <section class="machine" aria-label="Type Dash game">
        <div class="frame-head"><span><i></i> DASH SYSTEM <b>//</b> 01</span><span class="frame-tag">ENDLESS <b>·</b> ARCADE</span></div>
        <div class="stage" id="stage" data-state="MAIN_MENU">
          <canvas id="world" width="1280" height="720" aria-label="Side-scrolling gameplay" role="img"></canvas>
          <div id="hud" class="hud" hidden>
            <div class="hud-score"><span>SCORE</span><strong id="hud-score">0</strong></div>
            <div class="hud-combo" id="combo-box"><span>PERFECT COMBO</span><strong id="hud-combo">0×</strong></div>
            <div class="hud-right">
              <div><div id="wpm-box"><strong id="hud-wpm">0</strong> <span>WPM</span></div>
                <div id="accuracy-box"><strong id="hud-accuracy">100%</strong> <span>ACC</span></div></div>
              <button class="icon-btn pause-btn" data-action="pause" aria-label="Pause">${icon('pause')}</button>
            </div>
          </div>
          <div id="typing-card" class="typing-card" aria-hidden="true" hidden>
            <div class="typing-meta"><span id="typing-status"></span><span id="typing-count"></span></div>
            <div id="typing-letters" class="typing-letters"></div>
            <div class="typing-timer"><div id="typing-time"></div></div>
          </div>
          <div id="stage-hint" class="stage-hint" hidden></div>
          <div id="announcement" class="toast" role="status" hidden></div>
          <div id="overlay" class="overlay"></div>
          <p id="current-word" class="sr-only"></p>
        </div>
        <footer class="frame-foot">
          <div class="signal"><span id="status-light"></span><strong id="status-label">SYSTEM READY</strong></div>
          <div class="stage-display" id="stage-display" hidden>
            <span id="stage-name"></span><div id="stage-bars" class="stage-bars">${STAGES.map(() => '<i></i>').join('')}</div>
          </div>
          <div class="shortcuts"><kbd>A–Z</kbd> Type <kbd>Esc</kbd> Pause</div>
        </footer>
      </section>
      <footer class="cabinet-foot"><span>TYPE FAST. JUMP FASTER.</span><span>BUILT FOR THE KEYBOARD</span></footer>
      <p class="keyboard-notice">${icon('keyboard')} A physical keyboard is recommended for gameplay.</p>
    </main>`;
}

export function menu(): string {
  return `<div class="home">
    <p class="eyebrow menu-tag"><span></span> THE ENDLESS TYPING ARCADE</p>
    <h1>TYPE<span>DASH</span></h1>
    <p class="tagline">Type fast. Jump faster.</p>
    <div class="menu-actions">
      <button class="primary play" data-action="play">${icon('play')} Play now <kbd>Enter</kbd></button>
      <div class="secondary-actions">
        <button data-action="how">${icon('keyboard')} How to Play</button>
        <button data-action="settings">${icon('settings')} Settings</button>
        <button data-action="stats">${icon('stats')} Statistics</button>
      </div>
    </div>
  </div>`;
}

export function instructions(done: boolean): string {
  return done
    ? `<section class="panel compact">${back()}<p class="eyebrow">TRAINING / COMPLETE</p>
       <h2>Ready to dash.</h2><p class="subtext">You cleared all three practice obstacles.</p>
       <button class="primary" data-action="play">${icon('play')} Start a run</button></section>`
    : `<section class="panel instructions">${back()}<p class="eyebrow">TRAINING / 01</p><h2>How to play</h2>
       <div class="steps">
         <div><b>01</b><strong>Type</strong><p>The boxed letter is your next key. Typed letters turn mint.</p></div>
         <div><b>02</b><strong>Complete</strong><p>Finish it before the timer bar empties.</p></div>
         <div><b>03</b><strong>Jump</strong><p>The cube jumps automatically and unlocks the next word at takeoff.</p></div>
         <div><b>04</b><strong>Stay accurate</strong><p>A typo sends you back one letter, costs ${MISTAKE_POINTS} points, and breaks your combo.</p></div>
       </div>
       <button class="primary" data-action="practice">${icon('keyboard')} Practice three jumps</button></section>`;
}

export function paused(): string {
  return `<section class="panel compact"><p class="eyebrow">RUN / ON HOLD</p><h2>Paused</h2>
    <div class="stack">
      <button class="primary" data-action="resume">${icon('play')} Resume <kbd>Esc</kbd></button>
      <button class="secondary" data-action="restart">${icon('retry')} Restart</button>
      <button class="secondary" data-action="settings">${icon('settings')} Settings</button>
      <button class="quiet" data-action="home">Main menu</button>
    </div></section>`;
}

export function results(run: RunResult, previous: number): string {
  const personal = run.score > previous;
  return `<section class="panel results">
    <p class="eyebrow ${personal ? 'record' : ''}">${personal ? '◆ NEW PERSONAL BEST!' : 'RUN / COMPLETE'}</p>
    <h2>Game over</h2>
    <div class="result-score"><strong>${fmt.format(run.score)}</strong><span>FINAL SCORE</span></div>
    <div class="stat-grid">
      ${stat('Distance', `${fmt.format(run.distance)} m`)} ${stat('Time survived', elapsed(run.time))}
      ${stat('Words typed', fmt.format(run.words))} ${stat('Average WPM', run.wpm)}
      ${stat('Accuracy', pct(run.accuracy))} ${stat('Max combo', `${run.combo}×`)}
      ${stat('Previous best', fmt.format(previous))} ${stat('Obstacles', fmt.format(run.cleared))}
    </div>
    <div class="panel-actions">
      <button class="primary" data-action="play">${icon('retry')} Retry <kbd>Enter</kbd></button>
      <button class="secondary" data-action="home">Main menu</button>
    </div>
  </section>`;
}

export function statistics(save: Save): string {
  const s = save.stats;
  const leaderboard = save.entries.length ? `
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Date</th><th>Score</th><th>WPM</th><th>Acc.</th><th>Time</th></tr></thead>
    <tbody>${save.entries.map((entry, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${dateFmt.format(new Date(entry.date))}</td>
      <td>${fmt.format(entry.score)}</td><td>${entry.wpm}</td><td>${pct(entry.accuracy)}</td><td>${elapsed(entry.time)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">No runs yet. Play a game to set your first score.</p>';
  return `<section class="panel stats-panel">${back()}<p class="eyebrow">PLAYER / RECORDS</p><h2>Statistics</h2>
    <div class="stat-grid">
      ${stat('Best score', fmt.format(s.bestScore))} ${stat('Best WPM', fmt.format(s.bestWpm))}
      ${stat('Best accuracy · 20+ words', s.bestAccuracy ? pct(s.bestAccuracy) : '—')}
      ${stat('Longest combo', `${s.bestCombo}×`)} ${stat('Games played', fmt.format(s.games))}
      ${stat('Words typed', fmt.format(s.words))} ${stat('Obstacles cleared', fmt.format(s.cleared))}
      ${stat('Total time', elapsed(s.time))} ${stat('Correct letters', fmt.format(s.correct))}
      ${stat('Mistyped letters', fmt.format(s.incorrect))}
    </div>
    <h3>Top runs <small>LOCAL TOP 10</small></h3>${leaderboard}</section>`;
}

function slider(key: 'master' | 'music' | 'effects', label: string, value: number): string {
  return `<label class="slider"><span>${label}</span><input data-setting="${key}" type="range" min="0" max="100"
    value="${Math.round(value * 100)}" /> <output>${pct(value * 100)}</output></label>`;
}

function toggle(key: keyof Settings, label: string, enabled: boolean): string {
  return `<label class="toggle"><span>${label}</span><input data-setting="${key}" type="checkbox" ${enabled ? 'checked' : ''} /><i></i></label>`;
}

export function settings(s: Settings): string {
  return `<section class="panel settings-panel">${back()}<p class="eyebrow">SYSTEM / PREFERENCES</p><h2>Settings</h2>
    <div class="settings-grid">
      <fieldset><legend>Audio</legend>
        ${slider('master', 'Master volume', s.master)} ${slider('music', 'Music', s.music)} ${slider('effects', 'Sound effects', s.effects)}
        ${toggle('muted', 'Mute all audio', s.muted)}
      </fieldset>
      <div class="settings-column">
        <fieldset><legend>Visuals</legend>${toggle('particles', 'Particles', s.particles)}
          ${toggle('shake', 'Screen shake', s.shake)} ${toggle('reducedMotion', 'Reduced motion', s.reducedMotion)}</fieldset>
        <fieldset><legend>Gameplay HUD</legend>${toggle('wpm', 'Live WPM', s.wpm)}
          ${toggle('accuracy', 'Accuracy', s.accuracy)} ${toggle('combo', 'Combo', s.combo)}</fieldset>
      </div>
    </div>
    <div class="data-actions"><span>Saved data</span><button class="quiet danger" data-action="reset-scores">Reset high scores</button>
      <button class="quiet danger" data-action="reset-all">Reset all statistics</button></div>
    <dialog id="reset-dialog"><form method="dialog">
      <p class="eyebrow">SAVED DATA / RESET</p><h3 id="reset-title"></h3>
      <p>Confirm to delete this data from this browser.</p><div class="panel-actions">
        <button class="secondary" value="cancel" autofocus>Cancel</button>
        <button class="primary danger-fill" value="reset">Reset</button>
      </div></form></dialog></section>`;
}

export function updateHud(run: Run): void {
  put('hud-score', fmt.format(run.score));
  put('hud-combo', `${run.combo}×`);
  put('hud-wpm', run.liveWpm.toString());
  put('hud-accuracy', pct(run.accuracy));
  const course = STAGES[run.stage];
  put('stage-name', course.course.toUpperCase());
  element('stage-display').style.setProperty('--course-color', course.color);
  const bars = element('stage-bars').children;
  for (let i = 0; i < bars.length; i += 1) bars[i].classList.toggle('reached', i <= run.stage);
  updateTyping(run);
  if (run.tutorial) put('stage-hint', run.held ? 'Type the highlighted word to continue' : `PRACTICE · ${run.cleared} / 3 CLEARED`);
}

function updateTyping(run: Run): void {
  const active = run.active;
  const queued = run.queued;
  const word = active ?? queued;
  const card = element('typing-card');
  card.hidden = !word;
  const current = element('current-word');
  current.dataset.word = active?.word ?? '';
  current.dataset.typed = String(active?.typed ?? 0);
  put('current-word', active
    ? `${active.word}. ${active.typed} of ${active.word.length} letters typed. Next letter ${active.word[active.typed]}.`
    : queued ? 'Jump ready. The next word opens at takeoff.' : '');
  if (!word) return;

  const letters = element('typing-letters');
  if (letters.dataset.word !== word.word) {
    letters.dataset.word = word.word;
    letters.replaceChildren(...Array.from(word.word, (letter) => {
      const cell = document.createElement('span');
      cell.textContent = letter;
      return cell;
    }));
  }
  for (let i = 0; i < letters.children.length; i += 1) {
    letters.children[i].classList.toggle('is-typed', i < word.typed);
    letters.children[i].classList.toggle('is-next', i === word.typed);
  }

  const time = active
    ? Math.max(0, (active.latest - run.tick) / Math.max(1, active.latest - (active.opened ?? 0)))
    : 1;
  const late = active && !run.tutorial && run.tick > active.latest;
  const penalty = active && run.tick - active.mistakeTick < 0.8 * HZ;
  card.dataset.state = queued ? 'ready' : penalty || time < 0.2 ? 'danger' : 'active';
  put('typing-status', queued ? 'Jump ready · Next word at takeoff'
    : late ? 'Deadline missed'
    : penalty ? `Mistake · −${MISTAKE_POINTS} points`
    : run.held ? 'Type to continue' : 'Type this word');
  put('typing-count', queued ? '✓' : `${word.typed} / ${word.word.length}`);
  element('typing-time').style.transform = `scaleX(${time})`;
}

export function updateSettingsUi(save: Save): void {
  const { settings: s } = save;
  const mute = element('mute');
  mute.innerHTML = icon(s.muted ? 'muted' : 'sound');
  mute.setAttribute('aria-label', s.muted ? 'Unmute audio' : 'Mute audio');
  mute.setAttribute('aria-pressed', String(s.muted));
  element('combo-box').hidden = !s.combo;
  element('wpm-box').hidden = !s.wpm;
  element('accuracy-box').hidden = !s.accuracy;
  document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
  put('best', fmt.format(save.stats.bestScore));
}

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function put(id: string, text: string): void {
  const node = element(id);
  if (node.textContent !== text) node.textContent = text;
}
