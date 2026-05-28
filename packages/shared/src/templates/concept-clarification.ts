import type { WizardInputs } from '../types';

export function buildConceptClarificationOutputSpec(_inputs: WizardInputs): string {
  return [
    'For each concept I am confused about, deliver in this order:',
    '',
    "1. A short, plain-language explanation (under 4 sentences) at the level I'm working at.",
    "2. An analogy or metaphor that connects the concept to something I'm likely familiar with.",
    '3. One concrete worked example showing the concept in action.',
    "4. A check-for-understanding question that doesn't just restate the explanation — make me apply it.",
    "5. After I answer, give a 1-sentence read on what part I got and what I'm still missing.",
    '',
    'When I provide more than one confusion, handle them one at a time. Do not move to the next until I confirm I have the current one.',
  ].join('\n');
}

export function buildConceptClarificationFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    'Interaction style: Use a Socratic, adaptive approach.',
    'Ask me what I already think the concept means before explaining.',
    'Move in small steps and ask me to predict the next step where possible.',
    "If I make a wrong prediction, treat it as data — explain what's correct in my reasoning and what's off.",
  ].join(' ');
}
