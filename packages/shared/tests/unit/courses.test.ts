import { describe, it, expect } from 'vitest';
import { allCourses, findCourse, searchCourses } from '@composed-prompts/shared';

describe('courses loader', () => {
  it('loads all courses from JSON', () => {
    const courses = allCourses();
    expect(courses.length).toBeGreaterThan(50);
    expect(courses[0]).toHaveProperty('id');
    expect(courses[0]).toHaveProperty('name');
    expect(courses[0]).toHaveProperty('department');
  });

  it('finds a course by exact id', () => {
    const courses = allCourses();
    const sample = courses[0]!;
    const found = findCourse(sample.id);
    expect(found?.name).toBe(sample.name);
  });

  it('returns undefined for unknown id', () => {
    expect(findCourse('totally-fake-course-id')).toBeUndefined();
  });

  it('searchCourses returns case-insensitive substring matches sorted by relevance', () => {
    const matches = searchCourses('astro');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.name.toLowerCase()).toContain('astro');
  });

  it('searchCourses returns empty array for no matches', () => {
    expect(searchCourses('zzzzzzzzz')).toEqual([]);
  });

  it('searchCourses returns empty array for empty query', () => {
    expect(searchCourses('')).toEqual([]);
  });
});
