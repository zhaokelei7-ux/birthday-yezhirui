import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLayout, polar, sectorPath, CENTER, RINGS } from '../js/geometry.js';

const people = JSON.parse(
  readFileSync(new URL('../data/people.json', import.meta.url), 'utf8'),
);
const layout = buildLayout(people);

test('layout contains all 28 people with unique names', () => {
  assert.equal(layout.length, 28);
  assert.equal(new Set(layout.map((p) => p.name)).size, 28);
});

test('outer ring has 20 slices of 18 degrees each', () => {
  const outer = layout.filter((p) => p.ring === 'outer');
  assert.equal(outer.length, 20);
  for (const slice of outer) {
    assert.ok(Math.abs(slice.endAngle - slice.startAngle - 18) < 1e-9);
  }
});

test('each team owns 5 consecutive outer slices', () => {
  const outer = layout.filter((p) => p.ring === 'outer');
  for (const team of ['冲刺队', '战神队', '超越队', '力量队']) {
    const indexes = outer
      .map((p, i) => (p.team === team ? i : -1))
      .filter((i) => i >= 0);
    assert.equal(indexes.length, 5);
    assert.deepEqual(indexes, Array.from({ length: 5 }, (_, k) => indexes[0] + k));
  }
});

test('middle ring has 7 equal slices summing to 360 degrees', () => {
  const middle = layout.filter((p) => p.ring === 'middle');
  assert.equal(middle.length, 7);
  const total = middle.reduce((sum, s) => sum + (s.endAngle - s.startAngle), 0);
  assert.ok(Math.abs(total - 360) < 1e-6);
  for (const slice of middle) {
    assert.ok(Math.abs(slice.endAngle - slice.startAngle - 360 / 7) < 1e-9);
  }
});

test('center ring contains the teacher', () => {
  const center = layout.filter((p) => p.ring === 'center');
  assert.equal(center.length, 1);
  assert.equal(center[0].group, 'teacher');
  assert.equal(center[0].name, '卢钰涵');
});

test('polar places 0 degrees at the top', () => {
  const point = polar(CENTER, CENTER, 100, 0);
  assert.ok(Math.abs(point.x - CENTER) < 1e-9);
  assert.ok(Math.abs(point.y - (CENTER - 100)) < 1e-9);
});

test('sectorPath returns a closed path with two arcs', () => {
  const d = sectorPath(CENTER, CENTER, RINGS.outer.inner, RINGS.outer.outer, 0, 18);
  assert.match(d, /^M /);
  assert.match(d, / Z$/);
  assert.equal((d.match(/A /g) || []).length, 2);
});

test('label positions stay inside their ring', () => {
  for (const slice of layout.filter((p) => p.ring !== 'center')) {
    const ring = RINGS[slice.ring];
    assert.ok(slice.labelRadius > ring.inner);
    assert.ok(slice.labelRadius < ring.outer);
  }
});
