export const CENTER = 500;

export const RINGS = {
  outer: { inner: 340, outer: 470 },
  middle: { inner: 220, outer: 340 },
  center: { radius: 220 },
};

const OUTER_COUNT = 20;
const MIDDLE_COUNT = 7;

export function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function sectorPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const outerStart = polar(cx, cy, outerR, startAngle);
  const outerEnd = polar(cx, cy, outerR, endAngle);
  const innerEnd = polar(cx, cy, innerR, endAngle);
  const innerStart = polar(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    'Z',
  ].join(' ');
}

export function buildLayout(people) {
  const classmates = people.filter((p) => p.group === 'classmate');
  const volunteers = people.filter((p) => p.group === 'volunteer');
  const teachers = people.filter((p) => p.group === 'teacher');

  if (classmates.length !== OUTER_COUNT) {
    throw new Error(`同学数量应为 ${OUTER_COUNT}，实际 ${classmates.length}`);
  }
  if (volunteers.length !== MIDDLE_COUNT) {
    throw new Error(`志工数量应为 ${MIDDLE_COUNT}，实际 ${volunteers.length}`);
  }
  if (teachers.length !== 1) {
    throw new Error(`班主任数量应为 1，实际 ${teachers.length}`);
  }

  const teams = [...new Set(classmates.map((p) => p.team))];
  for (const team of teams) {
    const members = classmates.filter((p) => p.team === team);
    if (members.length !== 5) {
      throw new Error(`${team} 应有 5 位同学，实际 ${members.length}`);
    }
  }

  const layout = [];
  const outerStep = 360 / OUTER_COUNT;

  classmates.forEach((person, index) => {
    const startAngle = index * outerStep;
    const endAngle = startAngle + outerStep;
    layout.push({
      ...person,
      ring: 'outer',
      startAngle,
      endAngle,
      labelAngle: startAngle + outerStep / 2,
      labelRadius: (RINGS.outer.inner + RINGS.outer.outer) / 2,
    });
  });

  const middleStep = 360 / MIDDLE_COUNT;
  const middleOffset = -9;

  volunteers.forEach((person, index) => {
    const startAngle = middleOffset + index * middleStep;
    const endAngle = startAngle + middleStep;
    layout.push({
      ...person,
      ring: 'middle',
      startAngle,
      endAngle,
      labelAngle: startAngle + middleStep / 2,
      labelRadius: (RINGS.middle.inner + RINGS.middle.outer) / 2,
    });
  });

  const teacher = teachers[0];
  layout.push({
    ...teacher,
    ring: 'center',
    startAngle: 0,
    endAngle: 360,
    labelAngle: 0,
    labelRadius: 0,
  });

  return layout;
}
