import { buildLayout, CENTER, RINGS, polar, sectorPath } from './geometry.js';
import { createState, countLit, isLit } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_LABEL = { classmate: '同学', volunteer: '志工', teacher: '班主任' };

const els = {
  cake: document.querySelector('#cake'),
  progress: document.querySelector('#progress-count'),
  hint: document.querySelector('#hint'),
};

let layout = [];
let state = createState();
const sliceNodes = new Map();

async function init() {
  try {
    const response = await fetch('./data/people.json');
    if (!response.ok) throw new Error(`people.json ${response.status}`);
    const people = await response.json();
    layout = buildLayout(people);
    renderCake();
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

function ariaLabel(entry, lit) {
  const group = entry.group === 'classmate' ? entry.team : GROUP_LABEL[entry.group];
  return lit
    ? `${entry.name}，${group}，已点亮`
    : `${entry.name}，${group}，未点亮`;
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
      'aria-label': ariaLabel(entry, false),
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
    node.group.setAttribute('aria-label', ariaLabel(entry, lit));
  }
}

init();
