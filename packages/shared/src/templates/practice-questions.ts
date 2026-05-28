import type { WizardInputs } from '../types';

export function buildPracticeQuestionsOutputSpec(inputs: WizardInputs): string {
  const isEssayLike = inputs.assessmentType === 'paper' || inputs.assessmentType === 'project';
  const lines = [
    `Produce a set of practice questions matched to a ${inputs.assessmentType}.`,
    '',
    'Structure:',
  ];
  if (isEssayLike) {
    lines.push(
      '1. 3 essay-style prompts at increasing difficulty. For each: list a target argument structure and the kind of evidence the reader expects.',
      '2. 6 short-answer questions covering core concepts.',
      '3. A grading rubric (4-criteria, 4-level) for the essay prompts.',
    );
  } else {
    lines.push(
      '1. 6 multiple-choice questions with 4 options each, mixing recall and application.',
      '2. 4 short-answer questions requiring 1-3 sentence responses.',
      '3. 2 longer-form questions requiring multi-step reasoning.',
    );
  }
  lines.push(
    '',
    'Keep all answers in a separate ANSWERS section at the bottom. Do not reveal answers until I respond.',
    'After scoring my responses, highlight which concepts I should revisit.',
  );
  return lines.join('\n');
}

export function buildPracticeQuestionsFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    "Interaction style: Present the questions first. Wait for my answers before revealing the answer key — I want to genuinely self-test.",
    "When I respond, score each answer concretely (correct, partial, incorrect) and give a 1-2 sentence correction for misses.",
    "After scoring, suggest one targeted follow-up question for any concept I missed.",
  ].join(' ');
}
