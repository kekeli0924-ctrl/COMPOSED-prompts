// Browser-safe barrel export. Node-only modules (prompt-hash uses node:crypto,
// opus-full-prompt uses the Anthropic SDK with native deps) are NOT re-exported
// here — import them via deep paths from server code only:
//   import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash';
//   import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt';
export * from './types';
export * from './api-contracts';
export * from './validation/wizard-inputs';
export * from './courses';
export * from './model-profiles';
export * from './storage/redact';
export {
  templateFor,
  STUDY_MODE_LABELS,
  STUDY_MODE_DESCRIPTIONS,
} from './templates';
export {
  buildRoleSection,
  buildAboutMeSection,
  buildMaterialSection,
  buildGoalSection,
  buildSelfCheckSection,
} from './templates/shared';
export { assembleDeterministicPrompt, assembleSections } from './generation/assembler';
export { formatSection, formatAssembledPrompt } from './generation/format-selector';
