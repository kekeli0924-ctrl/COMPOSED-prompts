import type { WizardInputs } from '../types';

export function buildEssayProjectOutputSpec(_inputs: WizardInputs): string {
  return [
    'Deliver in this order, one stage at a time:',
    '',
    '1. Thesis development — propose 2-3 candidate thesis statements based on the prompt and material I shared, with a one-line strength/weakness analysis of each.',
    '2. Wait for me to pick (or refine) one.',
    '3. Outline — produce a section-by-section outline (intro, 3-5 body sections, conclusion) with a one-sentence claim per section and what evidence/example will support it.',
    '4. Evidence audit — list which claims still need supporting evidence and what kind would be strongest.',
    '5. Drafting plan — split the writing into manageable sessions matched to my available time, with a specific goal for each session (e.g., "Session 1: draft intro and body 1; Session 2: revise body 1 and draft body 2").',
    '',
    'Do not write the essay or project for me at any stage. Treat this as planning and feedback, not ghostwriting.',
  ].join('\n');
}

export function buildEssayProjectFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    "Interaction style: Coach me through the writing process — don't write the work itself for me.",
    'Push back on weak thesis statements and unsupported claims rather than affirming them.',
    'When I share a draft, give targeted line-edits and high-level structural notes, but keep the writing voice mine.',
  ].join(' ');
}
