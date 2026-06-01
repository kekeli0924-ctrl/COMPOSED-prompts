'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { searchCourses, findCourse } from '@composed-prompts/shared';

export function CoursePicker(props: {
  courseId: string | null;
  courseFreeText: string;
  onPick: (id: string | null, freeText?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showFreeText, setShowFreeText] = useState(
    props.courseId === null && props.courseFreeText.length > 0,
  );
  const results = useMemo(() => searchCourses(query, 8), [query]);
  const selectedCourse = props.courseId ? findCourse(props.courseId) : null;

  // When a course is selected, replace the search UI with a clear
  // confirmation card so the user knows their click registered.
  if (selectedCourse) {
    return (
      <div className="grid gap-4">
        <div className="rounded-2xl border-2 border-primary bg-accent p-4 ring-1 ring-ring">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-primary">
                Selected class
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {selectedCourse.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedCourse.department} · {selectedCourse.level}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                props.onPick(null);
                setQuery('');
              }}
            >
              Change
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // No course selected yet — show search + manual-entry options
  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="course-search">Search for your class</Label>
        <Input
          id="course-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try 'astronomy', 'eng', 'algebra'"
          className="mt-2"
        />
        {results.length > 0 && (
          <ul className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-card">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    props.onPick(c.id);
                    setShowFreeText(false);
                  }}
                >
                  <div>{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.department} · {c.level}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t pt-4">
        {!showFreeText ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShowFreeText(true);
              props.onPick(null);
            }}
          >
            Don&apos;t see your class? Enter it manually
          </Button>
        ) : (
          <div>
            <Label htmlFor="course-freetext">Class name</Label>
            <Input
              id="course-freetext"
              value={props.courseFreeText}
              onChange={(e) => props.onPick(null, e.target.value)}
              placeholder="e.g., Independent study with Mr. X"
              className="mt-2"
            />
          </div>
        )}
      </div>
    </div>
  );
}
