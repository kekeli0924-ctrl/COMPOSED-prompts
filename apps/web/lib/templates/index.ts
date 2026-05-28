import type { StudyMode, WizardInputs } from '@/lib/types';
import { buildCramReviewOutputSpec, buildCramReviewFallbackInteractionStyle } from './cram-review';
import { buildMultiDayPlanOutputSpec, buildMultiDayPlanFallbackInteractionStyle } from './multi-day-plan';
import { buildPracticeQuestionsOutputSpec, buildPracticeQuestionsFallbackInteractionStyle } from './practice-questions';
import { buildConceptClarificationOutputSpec, buildConceptClarificationFallbackInteractionStyle } from './concept-clarification';
import { buildEssayProjectOutputSpec, buildEssayProjectFallbackInteractionStyle } from './essay-project';

type ModeBuilders = {
  outputSpec: (i: WizardInputs) => string;
  fallbackInteractionStyle: (i: WizardInputs) => string;
};

const MODE_TABLE: Record<StudyMode, ModeBuilders> = {
  'cram-review': {
    outputSpec: buildCramReviewOutputSpec,
    fallbackInteractionStyle: buildCramReviewFallbackInteractionStyle,
  },
  'multi-day-plan': {
    outputSpec: buildMultiDayPlanOutputSpec,
    fallbackInteractionStyle: buildMultiDayPlanFallbackInteractionStyle,
  },
  'practice-questions': {
    outputSpec: buildPracticeQuestionsOutputSpec,
    fallbackInteractionStyle: buildPracticeQuestionsFallbackInteractionStyle,
  },
  'concept-clarification': {
    outputSpec: buildConceptClarificationOutputSpec,
    fallbackInteractionStyle: buildConceptClarificationFallbackInteractionStyle,
  },
  'essay-project': {
    outputSpec: buildEssayProjectOutputSpec,
    fallbackInteractionStyle: buildEssayProjectFallbackInteractionStyle,
  },
};

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  'cram-review': 'Cram review',
  'multi-day-plan': 'Multi-day study plan',
  'practice-questions': 'Practice questions',
  'concept-clarification': 'Concept clarification',
  'essay-project': 'Essay or project prep',
};

export const STUDY_MODE_DESCRIPTIONS: Record<StudyMode, string> = {
  'cram-review': 'Fast quiz-driven review before a test or quiz.',
  'multi-day-plan': 'A day-by-day plan across multiple study sessions.',
  'practice-questions': 'A set of practice questions matched to the assessment format.',
  'concept-clarification': 'Step-through explanation of specific concepts you find confusing.',
  'essay-project': 'Plan, outline, and feedback for an essay or project — not ghostwriting.',
};

export function templateFor(mode: StudyMode): ModeBuilders {
  return MODE_TABLE[mode];
}
