import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseCurriculum } from './parse-curriculum';

const SOURCE = '/Users/likerun/Downloads/Pomfret Curriculum Guide 2026-2027.md';
const OUT = resolve(__dirname, '..', 'data', 'courses.json');

const md = readFileSync(SOURCE, 'utf-8');
const courses = parseCurriculum(md);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(courses, null, 2));

console.log(`Wrote ${courses.length} courses to ${OUT}`);
const byDept = courses.reduce<Record<string, number>>((acc, c) => {
  acc[c.department] = (acc[c.department] ?? 0) + 1;
  return acc;
}, {});
console.log('By department:', byDept);
