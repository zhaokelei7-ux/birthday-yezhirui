import { buildLayout, CENTER, RINGS, polar, sectorPath } from './geometry.js';
import {
  createState, beginPlayback, completePlayback, cancelPlayback,
  isLit, countLit, isComplete, TOTAL,
} from './state.js';
import { loadLit, saveLit, clearLit } from './storage.js';
import { createPlayer } from './audio.js';
import { startFireworks } from './finale.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_LABEL = { classmate: '同学', volunteer: '志工', teacher: '班主任' };

const els = {
  cake: document.querySelector('#cake'),
  progress: document.querySelector('#progress-count'),
  hint: document.querySelector('#hint'),
  reset: document.querySelector('#reset-btn'),
  card: document.querySelector('#card'),
  cardKicker: document.querySelector('#card-kicker'),
  cardTitle: document.querySelector('#card-title'),
  cardBlessing: document.querySelector('#card-blessing'),
  cardStatus: document.querySelector('#card-status'),
  cardBar: document.querySelector('#card-bar'),
  cardReplay: document.querySelector('#card-replay'),
  cardClose: document.querySelector('#card-close'),
  finale: document.querySelector('#finale'),
  finaleCanvas: document.querySelector('#finale-canvas'),
  finaleClose: document.querySelector('#finale-close'),
  finaleAgain: document.querySelector('#finale-again'),
  finaleReplay: document.querySelector('#finale-replay'),
};

let layout = [];
let manifest = {};
let state = createState();
let player = null;
let activeName = null;
let activeView = 'blessing';
let lastFocus = null;
let stopFireworks = null;
let finaleReturnFocus = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sliceNodes = new Map();

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function init() {
  try {
    const [peopleResponse, manifestResponse] = await Promise.all([
      fetch('./data/people.json'),
      fetch('./data/audio-manifest.json').catch(() => null),
    ]);

    if (!peopleResponse.ok) throw new Error(`people.json ${peopleResponse.status}`);
    const people = await peopleResponse.json();

    if (manifestResponse && manifestResponse.ok) {
      try {
        manifest = await manifestResponse.json();
      } catch {
        manifest = {};
      }
    }

    layout = buildLayout(people);
    const knownNames = new Set(people.map((person) => person.name));
    state = createState({
      lit: loadLit(getStorage()).filter((name) => knownNames.has(name)),
    });

    player = createPlayer({
      onEnded: handleAudioEnded,
      onError: handleAudioError,
      onProgress: handleProgress,
      onDuration: handleDuration,
    });

    renderCake();
    bindEvents();
    render();
  } catch (error) {
    console.error('[birthday] 初始化失败', error);
    els.hint.textContent = '页面加载失败，请刷新重试；如果仍然失败，请联系制作人。';
    els.cake.replaceChildren();
  }
}

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function ariaLabel(entry, lit, canReplay) {
  const group = entry.group === 'classmate' ? entry.team : GROUP_LABEL[entry.group];
  if (!canReplay) {
    return lit
      ? `${entry.name}，${group}，已点亮，点击查看祝福`
      : `${entry.name}，${group}，未点亮，点击查看祝福`;
  }
  return lit
    ? `${entry.name}，${group}，已点亮，点击查看祝福并重播语音`
    : `${entry.name}，${group}，未点亮，点击播放语音`;
}

const SPRINKLE_COLORS = ['#ff8a65', '#ffd166', '#7fd1ae', '#7fb7ff', '#ff9fb2'];

// 每块蛋糕上的糖针位置由姓名决定，刷新后保持不变。
function sprinklesFor(entry) {
  let seed = 0;
  for (const char of entry.name) seed = (seed * 31 + char.codePointAt(0)) % 100000;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const isCenter = entry.ring === 'center';
  const inner = isCenter ? 120 : RINGS[entry.ring].inner;
  const outer = isCenter ? 190 : RINGS[entry.ring].outer;
  const start = isCenter ? 0 : entry.startAngle;
  const span = isCenter ? 360 : entry.endAngle - entry.startAngle;
  const nodes = [];

  for (let index = 0; index < 4; index += 1) {
    const radius = inner + (outer - inner) * (0.2 + random() * 0.65);
    const angle = start + span * (0.12 + random() * 0.76);
    const position = polar(CENTER, CENTER, radius, angle);
    nodes.push(el('rect', {
      x: (position.x - 7).toFixed(2),
      y: (position.y - 2.5).toFixed(2),
      width: 14,
      height: 5,
      rx: 2.5,
      fill: SPRINKLE_COLORS[Math.floor(random() * SPRINKLE_COLORS.length)],
      class: 'sprinkle',
      transform: `rotate(${(random() * 180).toFixed(1)} ${position.x.toFixed(2)} ${position.y.toFixed(2)})`,
    }));
  }

  return nodes;
}

function candleFor(entry) {
  const isCenter = entry.ring === 'center';
  const span = isCenter ? 0 : entry.endAngle - entry.startAngle;
  const angle = isCenter ? 0 : entry.startAngle + span * 0.2;
  const radius = isCenter ? 140 : RINGS[entry.ring].outer - 10;
  const base = polar(CENTER, CENTER, radius, angle);
  const width = isCenter ? 18 : 9;
  const height = isCenter ? 46 : 28;
  const flameWidth = isCenter ? 9 : 4.8;
  const flameHeight = isCenter ? 14 : 8.5;
  const top = base.y - height;

  const candle = el('g', { class: 'candle' });
  if (!isCenter) {
    candle.setAttribute(
      'transform',
      `rotate(${(angle + 180).toFixed(2)} ${base.x.toFixed(2)} ${base.y.toFixed(2)})`,
    );
  }
  candle.append(el('rect', {
    x: (base.x - width / 2).toFixed(2),
    y: top.toFixed(2),
    width,
    height,
    rx: width / 2,
    class: 'candle-wax',
  }));

  const bandHeight = Math.max(2.5, height * 0.14);
  for (const ratio of [0.3, 0.64]) {
    candle.append(el('rect', {
      x: (base.x - width / 2).toFixed(2),
      y: (top + height * ratio).toFixed(2),
      width,
      height: bandHeight.toFixed(2),
      rx: bandHeight / 2,
      class: 'candle-band',
    }));
  }

  candle.append(el('line', {
    x1: base.x.toFixed(2),
    y1: top.toFixed(2),
    x2: base.x.toFixed(2),
    y2: (top - (isCenter ? 6 : 4)).toFixed(2),
    class: 'wick',
  }));

  const flameCy = top - flameHeight * 0.75;
  candle.append(el('ellipse', {
    cx: base.x.toFixed(2),
    cy: flameCy.toFixed(2),
    rx: flameWidth,
    ry: flameHeight,
    class: 'flame',
  }));
  candle.append(el('ellipse', {
    cx: base.x.toFixed(2),
    cy: (flameCy + flameHeight * 0.3).toFixed(2),
    rx: (flameWidth * 0.48).toFixed(2),
    ry: (flameHeight * 0.52).toFixed(2),
    class: 'flame-core',
  }));

  return candle;
}

function renderCake() {
  els.cake.replaceChildren();
  els.cake.append(el('circle', { cx: CENTER, cy: CENTER, r: 500, class: 'plate-shadow' }));
  els.cake.append(el('circle', { cx: CENTER, cy: CENTER, r: 492, class: 'plate' }));

  for (const entry of layout) {
    const group = el('g', {
      class: 'slice',
      role: 'button',
      tabindex: '0',
      'data-name': entry.name,
      'data-team': entry.team,
      'data-ring': entry.ring,
      'aria-label': ariaLabel(entry, false, Boolean(manifest[entry.name])),
    });

    if (entry.ring === 'center') {
      group.append(el('circle', {
        cx: CENTER,
        cy: CENTER,
        r: RINGS.center.radius,
        class: 'slice-shape',
      }));
    } else {
      const ring = RINGS[entry.ring];
      group.append(el('path', {
        d: sectorPath(CENTER, CENTER, ring.inner, ring.outer, entry.startAngle, entry.endAngle),
        class: 'slice-shape',
      }));
      group.append(el('path', {
        d: sectorPath(CENTER, CENTER, ring.inner - 4, ring.outer + 4, entry.startAngle, entry.endAngle),
        class: 'slice-hit',
      }));
    }

    for (const sprinkle of sprinklesFor(entry)) group.append(sprinkle);

    const position = polar(CENTER, CENTER, entry.labelRadius, entry.labelAngle);
    const label = el('text', {
      x: position.x,
      y: position.y,
      class: `slice-name ring-${entry.ring}`,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    label.textContent = entry.name;
    group.append(label);

    group.append(candleFor(entry));

    group.addEventListener('click', () => handleSlice(entry.name));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSlice(entry.name);
      }
    });

    els.cake.append(group);
    sliceNodes.set(entry.name, { group, label });
  }

  const decor = el('g', { class: 'cake-decor', 'aria-hidden': 'true' });
  decor.append(el('circle', { cx: CENTER, cy: CENTER, r: RINGS.outer.outer, class: 'frosting-rim' }));
  decor.append(el('circle', { cx: CENTER, cy: CENTER, r: RINGS.middle.outer, class: 'ring-line' }));
  decor.append(el('circle', { cx: CENTER, cy: CENTER, r: RINGS.middle.inner, class: 'ring-line' }));
  els.cake.append(decor);
}

function render() {
  els.progress.textContent = String(countLit(state));
  els.cake.classList.toggle('is-playing', state.status === 'playing');

  for (const entry of layout) {
    const node = sliceNodes.get(entry.name);
    const lit = isLit(state, entry.name);
    node.group.classList.toggle('lit', lit);
    node.group.classList.toggle('playing', state.playingName === entry.name);
    node.group.setAttribute('aria-label', ariaLabel(entry, lit, Boolean(manifest[entry.name])));
  }

  const count = countLit(state);
  if (count >= TOTAL) {
    els.hint.textContent = `${TOTAL} 份祝福，全部点亮。`;
  } else if (count === 0) {
    els.hint.textContent = '点击任意一块蛋糕，听 TA 对你说生日快乐~';
  } else {
    els.hint.textContent = `已有 ${count} 份祝福被点亮，继续点击灰暗的蛋糕吧`;
  }

  els.finaleReplay.hidden = !isComplete(state);
}

function handleSlice(name) {
  const entry = layout.find((person) => person.name === name);
  if (!entry || state.status === 'playing') return;

  lastFocus = document.activeElement;

  if (isLit(state, name)) {
    openCard(entry, 'blessing');
    return;
  }

  const started = beginPlayback(state, name);
  if (!started) return;

  state = started;

  const audio = manifest[name];
  if (!audio) {
    state = completePlayback(state, name, { missingAudio: true });
    afterLit(entry, true);
    return;
  }

  openCard(entry, 'playing');
  player.play(audio.file, { durationHint: audio.duration });
  render();
}

function handleAudioEnded() {
  const name = state.playingName;
  if (!name) return;
  const entry = layout.find((person) => person.name === name);
  if (!entry) return;

  const newlyLit = !isLit(state, name);
  state = completePlayback(state, name);
  afterLit(entry, newlyLit);
}

function handleAudioError() {
  const name = state.playingName;
  if (!name) return;
  const entry = layout.find((person) => person.name === name);
  if (!entry) return;

  const newlyLit = !isLit(state, name);
  state = completePlayback(state, name, { missingAudio: true });
  afterLit(entry, newlyLit);
}

function afterLit(entry, newlyLit = false) {
  saveLit(getStorage(), state.lit);
  render();

  if (newlyLit && isComplete(state)) {
    closeCard({ stopAudio: false });
    showFinale();
    return;
  }

  openCard(entry, 'blessing');
}

function openCard(entry, view) {
  activeName = entry.name;
  activeView = view;

  const groupName = entry.group === 'classmate' ? entry.team : GROUP_LABEL[entry.group];

  els.card.hidden = false;

  els.cardKicker.textContent = view === 'playing' ? '正在收听' : '来自';
  els.cardTitle.textContent = view === 'playing'
    ? entry.name
    : `${entry.name} · ${groupName}`;
  els.cardBlessing.textContent = view === 'playing'
    ? '请听 TA 对你说的话…'
    : entry.blessing;
  els.cardStatus.textContent = view === 'playing'
    ? '正在播放 0″'
    : '这份祝福已点亮';
  els.cardBar.style.width = view === 'playing' ? '0%' : '100%';
  els.cardReplay.hidden = view !== 'blessing' || !manifest[entry.name];

  els.cardClose.focus({ preventScroll: true });
}

function closeCard({ stopAudio = true } = {}) {
  if (stopAudio && state.status === 'playing') {
    player.stop();
    state = cancelPlayback(state);
    render();
  }

  els.card.hidden = true;
  activeName = null;

  if (lastFocus && document.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
}

function showFinale() {
  if (els.finale.hidden) finaleReturnFocus = document.activeElement;
  els.finale.hidden = false;
  els.finaleClose.focus({ preventScroll: true });

  if (reducedMotion) {
    els.finale.classList.add('reduced');
    return;
  }

  if (stopFireworks) stopFireworks();
  stopFireworks = startFireworks(els.finaleCanvas, { duration: 8000 });
}

function hideFinale() {
  if (stopFireworks) {
    stopFireworks();
    stopFireworks = null;
  }
  els.finale.hidden = true;

  if (finaleReturnFocus && document.contains(finaleReturnFocus)) {
    finaleReturnFocus.focus({ preventScroll: true });
  }
  finaleReturnFocus = null;
}

function replay() {
  if (!activeName || state.status === 'playing') return;

  const entry = layout.find((person) => person.name === activeName);
  const audio = manifest[activeName];
  if (!entry || !audio) return;

  const started = beginPlayback(state, activeName);
  if (!started) return;

  state = started;
  openCard(entry, 'playing');
  player.play(audio.file, { durationHint: audio.duration });
  render();
}

function handleProgress(current, duration) {
  if (activeView !== 'playing' || !duration || els.card.hidden) return;
  const ratio = Math.max(0, Math.min(1, current / duration));
  els.cardBar.style.width = `${(ratio * 100).toFixed(1)}%`;
  els.cardStatus.textContent = `正在播放 ${formatTime(current)} / ${formatTime(duration)}`;
}

function handleDuration(duration) {
  if (activeView !== 'playing' || els.card.hidden) return;
  els.cardStatus.textContent = `正在播放 0″ / ${formatTime(duration)}`;
}

function formatTime(seconds) {
  return `${Math.max(0, Math.round(seconds))}″`;
}

function bindEvents() {
  els.cardClose.addEventListener('click', () => closeCard());
  els.cardReplay.addEventListener('click', replay);
  els.card.addEventListener('click', (event) => {
    if (event.target === els.card) closeCard();
  });
  els.reset.addEventListener('click', resetProgress);
  els.finaleClose.addEventListener('click', hideFinale);
  els.finaleAgain.addEventListener('click', showFinale);
  els.finaleReplay.addEventListener('click', showFinale);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.finale.hidden) {
      hideFinale();
    } else if (!els.card.hidden) {
      closeCard();
    }
  });
}

function resetProgress() {
  if (!window.confirm(`确定要清空 ${TOTAL} 份祝福的点亮进度吗？`)) return;

  player.stop();
  clearLit(getStorage());
  state = createState();
  closeCard({ stopAudio: false });
  hideFinale();
  els.finaleReplay.hidden = true;
  render();
}

init();
