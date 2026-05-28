import type { WizardInputs } from '../types.js';

export function buildCramReviewOutputSpec(_inputs: WizardInputs): string {
  return [
    'Produce a focused cram-review session in this exact shape:',
    '',
    '1. A 5-question diagnostic quiz on the highest-leverage concepts (mix of recall and short application).',
    '2. After I answer, score each question and give a one-sentence correction for any I missed.',
    '3. A 10-question deeper quiz that targets my weakest areas from step 1.',
    '4. A final 3-question synthesis quiz that asks me to apply or connect concepts.',
    '',
    'Format: Number every question, separate questions and answers (give me answers only after I respond), and keep explanations short — under 3 sentences each.',
  ].join('\n');
}

export function buildCramReviewFallbackInteractionStyle(inputs: WizardInputs): string {
  const conf = inputs.confidence ?? 3;
  const hrs = inputs.hoursAvailable;
  if (conf <= 2 && hrs <= 4) {
    return [
      'Interaction style: Start with rapid-fire questions on fundamentals.',
      "If I miss something, give a brief 1-2 sentence correction, then re-test the same concept later in the session.",
      "Don't lecture or over-explain unless I ask.",
    ].join(' ');
  }
  if (conf >= 4 && hrs >= 6) {
    return [
      'Interaction style: Skip the basics. Push for depth — ask harder application questions and synthesis prompts.',
      'Challenge my reasoning with follow-ups rather than affirming first responses.',
    ].join(' ');
  }
  return [
    'Interaction style: Alternate between recall and application questions.',
    'Briefly correct mistakes (1-2 sentences) and re-test weak areas before moving on.',
  ].join(' ');
}
