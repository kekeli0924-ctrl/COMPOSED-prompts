import type { WizardInputs } from '@/lib/types';

export function buildMultiDayPlanOutputSpec(inputs: WizardInputs): string {
  const days = Math.max(1, Math.round(inputs.hoursAvailable / 24));
  return [
    `Produce a day-by-day study plan covering ${days} day(s) leading up to my ${inputs.assessmentType} on ${inputs.assessmentDate}.`,
    '',
    'For each day, include:',
    '1. Focus topic(s) — what I should be working on that day, prioritized.',
    '2. Two-to-three short study sessions (30-45 min each) with specific activities.',
    '3. A 5-question self-test at the end of each day, with answers in a separate section.',
    "4. A built-in recall check from prior days (spaced practice — don't just move on).",
    '',
    'On the final day before the assessment, schedule a comprehensive review and a brief calming wind-down.',
    'Use a clear heading per day. Keep each day on one screen.',
  ].join('\n');
}

export function buildMultiDayPlanFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    'Interaction style: Build the plan as a self-directed schedule.',
    'Apply spaced practice — each day must revisit material from earlier days, not just push forward.',
    'Interleave question types (recall, application, synthesis) rather than blocking by topic.',
    'After delivering the plan, ask whether the daily time budget feels realistic and offer to redistribute if not.',
  ].join(' ');
}
