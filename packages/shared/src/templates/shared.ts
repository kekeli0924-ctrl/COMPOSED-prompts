import type { WizardInputs } from '../types.js';
import { findCourse } from '../courses.js';
import { describeAttachedKinds } from '../material-kinds.js';

const courseLabel = (inputs: WizardInputs): string => {
  if (inputs.courseId) {
    const c = findCourse(inputs.courseId);
    return c?.name ?? inputs.courseFreeText ?? 'an unspecified course';
  }
  return inputs.courseFreeText ?? 'an unspecified course';
};

const courseContext = (inputs: WizardInputs): string => {
  if (!inputs.courseId) return '';
  const c = findCourse(inputs.courseId);
  if (!c) return '';
  const parts = [
    `Department: ${c.department}.`,
    `Level: ${c.level}.`,
    c.description ? `Course description: ${c.description}` : '',
  ].filter(Boolean);
  return parts.join(' ');
};

const personaFor = (confidence: number | undefined): string => {
  if (confidence === undefined) return 'thoughtful';
  if (confidence <= 2) return 'patient';
  if (confidence >= 4) return 'rigorous';
  return 'thoughtful';
};

export function buildRoleSection(inputs: WizardInputs): string {
  const persona = personaFor(inputs.confidence);
  const course = courseLabel(inputs);
  const context = courseContext(inputs);
  return [
    `You are a ${persona} tutor for ${course} at Pomfret School, a U.S. boarding school.`,
    context,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function buildAboutMeSection(inputs: WizardInputs, studentGrade?: string): string {
  const lines: string[] = [];
  if (studentGrade) {
    lines.push(`- Grade: ${studentGrade}`);
  }
  if (inputs.courseId) {
    const c = findCourse(inputs.courseId);
    if (c) {
      lines.push(`- Course: ${c.name} (${c.level})`);
      lines.push(`- Department: ${c.department}`);
    }
  } else if (inputs.courseFreeText) {
    lines.push(`- Course: ${inputs.courseFreeText}`);
  }
  if (inputs.confidence !== undefined) {
    lines.push(`- Confidence: ${inputs.confidence} of 5`);
  }
  if (inputs.understanding) {
    lines.push(`- What I understand: ${inputs.understanding}`);
  }
  if (inputs.confusion) {
    lines.push(`- What confuses me: ${inputs.confusion}`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No additional context provided.';
}

export function buildMaterialSection(inputs: WizardInputs): string {
  const kinds = inputs.attachedMaterialKinds ?? [];
  const hasText = Boolean(inputs.material && inputs.material.trim().length > 0);

  if (kinds.length > 0) {
    const attach = `I will attach my ${describeAttachedKinds(kinds)} to you. Read it first, extract the 6-8 most important topics it covers, and base our session on those.`;
    return hasText ? `${attach}\n\nI've also pasted some material:\n${inputs.material!.trim()}` : attach;
  }
  if (hasText) {
    return inputs.material!.trim();
  }
  return 'I have shared no specific material — please ask me to share my notes, syllabus, or topic list if you need them to be effective.';
}

const formatHours = (h: number): string => {
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return `${minutes} minutes`;
  }
  if (h < 24) return `${h} hours`;
  const days = Math.round(h / 24);
  return `${days} days`;
};

export function buildGoalSection(inputs: WizardInputs): string {
  return [
    `I'm preparing for a ${inputs.assessmentType} on ${inputs.assessmentDate}.`,
    `I have ${formatHours(inputs.hoursAvailable)} of study time between now and then.`,
  ].join(' ');
}

export function buildSelfCheckSection(inputs: WizardInputs): string {
  const course = courseLabel(inputs);
  return [
    'Before responding:',
    `- Confirm the material aligns with the level expected in ${course}.`,
    '- If anything I provided is unclear or you need more material, ask me a clarifying question before proceeding.',
    '',
    'If I push back on your output:',
    "- Don't simply agree — explain your reasoning.",
    "- Adjust only if I'm correct or if I provide new information.",
    '',
    'After your response, ask: "Did this hit what you needed? If not, what should be different?"',
  ].join('\n');
}
