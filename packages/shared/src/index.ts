// Browser-safe barrel export. Node-only modules (prompt-hash uses node:crypto,
// opus-full-prompt uses the Anthropic SDK with native deps) are NOT re-exported
// here — import them via deep paths from server code only:
//   import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash';
//   import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt';
//
// All relative imports use .js extensions for NodeNext / ESM compatibility.
// Bundler-resolution (Next.js) handles them fine; tsc NodeNext requires them.
export * from './types.js';
export * from './api-contracts.js';
export * from './validation/wizard-inputs.js';
export * from './courses.js';
export * from './model-profiles.js';
export * from './material-kinds.js';
export * from './grade.js';
export * from './calendar.js';
export * from './study-schedule.js';
export * from './storage/redact.js';
export {
  templateFor,
  STUDY_MODE_LABELS,
  STUDY_MODE_DESCRIPTIONS,
} from './templates/index.js';
export {
  buildRoleSection,
  buildAboutMeSection,
  buildMaterialSection,
  buildGoalSection,
  buildSelfCheckSection,
} from './templates/shared.js';
export { assembleDeterministicPrompt, assembleSections } from './generation/assembler.js';
export { formatSection, formatAssembledPrompt } from './generation/format-selector.js';
