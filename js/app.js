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
    console.error(error);
    els.hint.textContent = '页面加载失败，请刷新重试。';
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
  if (!lit) return `${entry.name}，${group}，未点亮，点击播放语音`;
  return canReplay
    ? `${entry.name}，${group}，已点亮，点击查看祝福并重播语音`
    : `${entry.name}，${group}，已点亮，点击查看祝福`;
}

function renderCake() {
  els.cake.replaceChildren();
  els.cake.append(el('circle', { cx: CENTER, cy: CENTER, r: 492, class: 'plate' }));

  for (const entry of layout) {
    const group = el('g', {
      class: 'slice',
      role: 'button',
      tabindex: '0',
      'data-name': entry.name,
      'data-team': entry.team,
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

    const flamePosition = entry.ring === 'center'
      ? { x: CENTER, y: CENTER }
      : polar(CENTER, CENTER, RINGS[entry.ring].outer - 16, entry.labelAngle);
    group.append(el('circle', {
      cx: flamePosition.x,
      cy: flamePosition.y,
      r: entry.ring === 'center' ? 0 : 3.2,
      class: 'flame',
    }));

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
}

function render() {
  els.progress.textContent = String(countLit(state));

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
    els.hint.textContent = '点击任意一块蛋糕，听 TA 对你说生日快乐';
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

  state = completePlayback(state, name);
  afterLit(entry, false);
}

function handleAudioError() {
  const name = state.playingName;
  if (!name) return;
  const entry = layout.find((person) => person.name === name);
  if (!entry) return;

  state = completePlayback(state, name, { missingAudio: true });
  afterLit(entry, true);
}

function afterLit(entry, missingAudio) {
  saveLit(getStorage(), state.lit);
  render();

  if (isComplete(state)) {
    closeCard({ stopAudio: false });
    showFinale();
    return;
  }

  openCard(entry, 'blessing', { missingAudio });
}

function openCard(entry, view, { missingAudio = false } = {}) {
  activeName = entry.name;
  activeView = view;

  const groupName = entry.group === 'classmate' ? entry.team : GROUP_LABEL[entry.group];
  const missing = missingAudio || state.missingAudio.includes(entry.name) || !manifest[entry.name];

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
    : missing ? '语音暂缺，祝福已点亮' : '这份祝福已点亮';
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
