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

export type WizardInputs = {
  // Step 1
  provider: string;          // e.g. 'anthropic'
  model: string;             // e.g. 'claude-opus-4-7'

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

  // Step 6 (optional)
  confidence?: 1 | 2 | 3 | 4 | 5;
  understanding?: string;    // max 2000 chars
  confusion?: string;        // max 2000 chars
};

export type GenerateResponse = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error';
  };
};

export type FeedbackPayload = {
  promptHash: string;
  provider: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  text?: string;
};
