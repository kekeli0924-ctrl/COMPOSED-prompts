// Display name of the server-side model that GENERATES study prompts (always
// Claude Opus, regardless of which LLM the student picks to run the prompt in).
// Single source of truth for user-facing copy — bump this one line on a model
// upgrade so the loading screen and fallback notice never drift out of date.
export const GENERATION_MODEL_NAME = 'Claude Opus 4.8';
