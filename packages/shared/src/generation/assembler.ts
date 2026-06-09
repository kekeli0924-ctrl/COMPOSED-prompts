import type { WizardInputs } from '../types.js';
import { getModelProfile } from '../model-profiles.js';
import { templateFor } from '../templates/index.js';
import {
  buildRoleSection,
  buildAboutMeSection,
  buildMaterialSection,
  buildGoalSection,
  buildSelfCheckSection,
  CONFIDENCE_CALIBRATION_STYLE,
} from '../templates/shared.js';
import { formatAssembledPrompt, type Section } from './format-selector.js';

export type AssembleOptions = {
  // Inject a custom interaction style (e.g., from Sonnet); falls back to deterministic if absent
  interactionStyleOverride?: string;
  studentGrade?: string;
};

export function assembleSections(inputs: WizardInputs, opts: AssembleOptions = {}): Section[] {
  const t = templateFor(inputs.mode);
  const interaction = opts.interactionStyleOverride ?? t.fallbackInteractionStyle(inputs);
  return [
    { name: 'role', body: buildRoleSection(inputs) },
    { name: 'about_me', body: buildAboutMeSection(inputs, opts.studentGrade) },
    { name: 'material', body: buildMaterialSection(inputs) },
    { name: 'goal', body: buildGoalSection(inputs) },
    // Calibration is appended here (not per-mode) so every mode's interaction style
    // carries it — the template-v2 mirror of the Opus system prompt's directive.
    { name: 'interaction_style', body: `Interaction style: ${interaction.replace(/^Interaction style:\s*/i, '')} ${CONFIDENCE_CALIBRATION_STYLE}` },
    { name: 'output_spec', body: t.outputSpec(inputs) },
    { name: 'self_check', body: buildSelfCheckSection(inputs) },
  ];
}

export function assembleDeterministicPrompt(inputs: WizardInputs, opts: AssembleOptions = {}): string {
  const profile = getModelProfile(inputs.provider, inputs.model);
  const sections = assembleSections(inputs, opts);
  return formatAssembledPrompt(profile.format, sections);
}
