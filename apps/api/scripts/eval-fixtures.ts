import type { WizardInputs } from '@composed-prompts/shared';

// Representative wizard inputs for the offline eval harness: all 5 modes, varied
// confidence (including unset), with/without material, near/far assessment dates,
// catalog + free-text courses. Course ids are real catalog entries. Dates are fixed
// (not relative) so graded outputs stay comparable across runs.
export type EvalFixture = { name: string; inputs: WizardInputs };

const SAMPLE_MATERIAL = [
  'Unit 4: Stellar evolution. Main sequence stars fuse hydrogen in their cores;',
  'mass determines lifetime and fate. Low-mass -> red giant -> planetary nebula ->',
  'white dwarf. High-mass -> supergiant -> supernova -> neutron star or black hole.',
  'H-R diagram axes: luminosity vs surface temperature (reversed). Key terms:',
  'hydrostatic equilibrium, degeneracy pressure, Chandrasekhar limit (1.4 solar masses).',
].join('\n');

const ESSAY_MATERIAL = [
  'Essay prompt: "To what extent did Reconstruction succeed in transforming Southern',
  'society?" Requirements: 5-7 pages, at least 6 primary sources, thesis-driven,',
  'engage at least one counterargument. Draft due in two weeks.',
].join('\n');

export const EVAL_FIXTURES: EvalFixture[] = [
  // ---- cram-review (4) ----
  {
    name: 'cram-low-confidence-with-material-near',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'science-adv-biology',
      mode: 'cram-review', assessmentType: 'test', assessmentDate: '2026-06-12',
      hoursAvailable: 2, confidence: 1, material: SAMPLE_MATERIAL,
      confusion: 'I mix up what happens to high-mass vs low-mass stars at the end.',
    },
  },
  {
    name: 'cram-high-confidence-no-material-near',
    inputs: {
      provider: 'openai', model: 'gpt-5-5', courseId: 'mathematics-adv-calculus-i',
      mode: 'cram-review', assessmentType: 'quiz', assessmentDate: '2026-06-11',
      hoursAvailable: 1, confidence: 5,
      understanding: 'Derivatives and the chain rule are solid; integration by parts is fine.',
    },
  },
  {
    name: 'cram-unset-confidence-freetext-course',
    inputs: {
      provider: 'google', model: 'gemini-3-1-pro', courseId: null, courseFreeText: 'Marine Biology independent study',
      mode: 'cram-review', assessmentType: 'test', assessmentDate: '2026-06-13',
      hoursAvailable: 3,
    },
  },
  {
    name: 'cram-mid-confidence-attached-kinds',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'history-and-social-sciences-adv-african-american-studies',
      mode: 'cram-review', assessmentType: 'test', assessmentDate: '2026-06-14',
      hoursAvailable: 4, confidence: 3, attachedMaterialKinds: ['study-guide'],
    },
  },

  // ---- multi-day-plan (3) ----
  {
    name: 'plan-far-final-with-material',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'science-adv-biology',
      mode: 'multi-day-plan', assessmentType: 'test', assessmentDate: '2026-09-25',
      hoursAvailable: 12, confidence: 2, material: SAMPLE_MATERIAL,
    },
  },
  {
    name: 'plan-week-out-no-material',
    inputs: {
      provider: 'openai', model: 'gpt-5-5', courseId: 'world-languages-adv-francophone-language-culture',
      mode: 'multi-day-plan', assessmentType: 'test', assessmentDate: '2026-06-17',
      hoursAvailable: 6, confidence: 3,
      confusion: 'Subjunctive triggers and object pronoun order.',
    },
  },
  {
    name: 'plan-unset-confidence-freetext',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: null, courseFreeText: 'AP Statistics self-study',
      mode: 'multi-day-plan', assessmentType: 'test', assessmentDate: '2026-07-10',
      hoursAvailable: 20,
    },
  },

  // ---- practice-questions (3) ----
  {
    name: 'practice-low-confidence-with-material',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'mathematics-adv-calculus-i',
      mode: 'practice-questions', assessmentType: 'test', assessmentDate: '2026-06-15',
      hoursAvailable: 3, confidence: 2, material: 'Related rates, optimization, L\'Hopital, Riemann sums, FTC parts 1 and 2.',
    },
  },
  {
    name: 'practice-high-confidence-near-quiz',
    inputs: {
      provider: 'google', model: 'gemini-3-1-pro', courseId: 'science-adv-biology',
      mode: 'practice-questions', assessmentType: 'quiz', assessmentDate: '2026-06-11',
      hoursAvailable: 1, confidence: 4,
      understanding: 'Comfortable with cellular respiration; want hard application questions.',
    },
  },
  {
    name: 'practice-unset-confidence-no-material-far',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'wellbeing-adv-psychology',
      mode: 'practice-questions', assessmentType: 'test', assessmentDate: '2026-08-30',
      hoursAvailable: 8,
    },
  },

  // ---- concept-clarification (3) ----
  {
    name: 'concept-confused-with-material',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'science-adv-biology',
      mode: 'concept-clarification', assessmentType: 'test', assessmentDate: '2026-06-16',
      hoursAvailable: 2, confidence: 2, material: SAMPLE_MATERIAL,
      confusion: 'Why degeneracy pressure stops collapse for white dwarfs but not for heavier cores.',
    },
  },
  {
    name: 'concept-freetext-course-unset-confidence',
    inputs: {
      provider: 'openai', model: 'gpt-5-5', courseId: null, courseFreeText: 'Intro Microeconomics',
      mode: 'concept-clarification', assessmentType: 'quiz', assessmentDate: '2026-06-19',
      hoursAvailable: 2,
      confusion: 'Elasticity vs slope — they look like the same thing to me.',
    },
  },
  {
    name: 'concept-high-confidence-edge',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'english-eng-19th-century-russian-literature',
      mode: 'concept-clarification', assessmentType: 'paper', assessmentDate: '2026-07-01',
      hoursAvailable: 5, confidence: 4,
      understanding: 'I can summarize the plots; I struggle to articulate how narrative voice differs across authors.',
    },
  },

  // ---- essay-project (3) ----
  {
    name: 'essay-with-prompt-material-far',
    inputs: {
      provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'history-and-social-sciences-adv-african-american-studies',
      mode: 'essay-project', assessmentType: 'paper', assessmentDate: '2026-09-10',
      hoursAvailable: 15, confidence: 3, material: ESSAY_MATERIAL,
    },
  },
  {
    name: 'essay-low-confidence-near-deadline',
    inputs: {
      provider: 'openai', model: 'gpt-5-5', courseId: 'english-eng-19th-century-russian-literature',
      mode: 'essay-project', assessmentType: 'paper', assessmentDate: '2026-06-13',
      hoursAvailable: 4, confidence: 1,
      confusion: 'I have quotes collected but no thesis.',
    },
  },
  {
    name: 'essay-freetext-unset-confidence',
    inputs: {
      provider: 'google', model: 'gemini-3-1-pro', courseId: null, courseFreeText: 'Journalism elective',
      mode: 'essay-project', assessmentType: 'project', assessmentDate: '2026-07-20',
      hoursAvailable: 10,
    },
  },
];
