import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const people = JSON.parse(
  readFileSync(new URL('../data/people.json', import.meta.url), 'utf8'),
);

const TEAMS = ['冲刺队', '战神队', '超越队', '力量队'];

test('there are exactly 28 people', () => {
  assert.equal(people.length, 28);
});

test('group counts are 20 classmates, 7 volunteers, 1 teacher', () => {
  const counts = people.reduce((acc, p) => {
    acc[p.group] = (acc[p.group] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { classmate: 20, volunteer: 7, teacher: 1 });
});

test('every team has exactly 5 classmates', () => {
  for (const team of TEAMS) {
    assert.equal(people.filter((p) => p.group === 'classmate' && p.team === team).length, 5);
  }
});

test('names are unique', () => {
  const names = people.map((p) => p.name);
  assert.equal(new Set(names).size, 28);
});

test('everyone has a non-empty blessing of reasonable length', () => {
  for (const person of people) {
    assert.equal(typeof person.blessing, 'string');
    assert.ok(person.blessing.trim().length >= 8, `${person.name} 的祝福太短`);
    assert.ok(person.blessing.trim().length <= 60, `${person.name} 的祝福太长`);
  }
});

test('volunteers and teacher have the expected team labels', () => {
  for (const person of people.filter((p) => p.group === 'volunteer')) {
    assert.equal(person.team, '志工团');
  }
  for (const person of people.filter((p) => p.group === 'teacher')) {
    assert.equal(person.team, '班主任');
  }
});
