export type StudyMode =
  | 'cram-review'
  | 'multi-day-plan'
  | 'practice-questions'
  | 'concept-clarification'
  | 'essay-project';

export type AssessmentType =
  | 'test'
  | 'quiz'
  | 'paper'
  | 'project'
  | 'presentation'
  | 'other';

export type MaterialKind =
  | 'study-guide'
  | 'class-notes'
  | 'past-quiz'
  | 'textbook'
  | 'slides'
  | 'problem-set';

export type WizardInputs = {
  // Step 1
  provider: string;          // e.g. 'anthropic'
  model: string;             // e.g. 'claude-opus-4-8'

  // Step 2
  courseId: string | null;   // null when 'Other'
  courseFreeText?: string;   // used when courseId is null

  // Step 3
  mode: StudyMode;

  // Step 4
  assessmentType: AssessmentType;
  assessmentDate: string;    // ISO yyyy-mm-dd
  hoursAvailable: number;    // e.g. 0.5, 1, 2, 4, 8, 24, 72, ...

  // Step 5 (optional)
  material?: string;         // max 20000 chars
  // Step 5 (optional) — what the student will attach to their own LLM
  attachedMaterialKinds?: MaterialKind[];

  // Step 6 (optional)
  confidence?: 1 | 2 | 3 | 4 | 5;
  understanding?: string;    // max 2000 chars
  confusion?: string;        // max 2000 chars

  // Stage 2: inject the student's own most recent session recap for this course into
  // the generation (default true; only effective when signed in with a catalog course).
  useRecap?: boolean;
};
