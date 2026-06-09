import Anthropic from '@anthropic-ai/sdk';
import type { WizardInputs } from '../types.js';
import { STUDY_MODE_LABELS, STUDY_MODE_DESCRIPTIONS } from '../templates/index.js';
import { findCourse } from '../courses.js';
import { getModelProfile } from '../model-profiles.js';
import { describeAttachedKinds } from '../material-kinds.js';
import {
  RECAP_START_MARKER,
  RECAP_WEAK_SPOTS_MARKER,
  RECAP_FOLLOW_UP_MARKER,
  RECAP_END_MARKER,
} from '../recap-format.js';
import { ACTIVE_TEMPLATE_VERSION, type TemplateVersionId } from './template-versions.js';

export const OPUS_MODEL = 'claude-opus-4-8';

// v1 system prompt — FROZEN VERBATIM. Do not edit: rows stamped template_version 'v1'
// were generated with exactly this text, and the eval harness (Phase 3) compares
// versions against it. New prompt-engineering goes in a NEW version below.
export const OPUS_SYSTEM_PROMPT_V1 = `You are an expert prompt engineer creating customized study prompts for Pomfret School students. Your output is pasted verbatim into the student's chosen LLM (ChatGPT, Claude, or Gemini) for a study session — so write it AS the prompt the student will send, not ABOUT what such a prompt would look like.

# The Pomfret-Study framework

Every prompt you write has exactly 7 sections, in this order:

1. ROLE — A tutor persona. Match the persona's tone to the student's confidence (patient if shaky, rigorous if confident) and the course's rigor.

2. ABOUT ME — Briefly state who the student is. Include only what they shared: course + level + department; their self-rated confidence; what they already understand; what confuses them.

3. MATERIAL — Drop in the student's pasted material verbatim. If they didn't paste material, instruct the tutor LLM to ask for notes, the syllabus, or a topic list before going deep — don't try to fake it.

4. GOAL & CONSTRAINTS — The upcoming assessment (type + date), time available, the chosen study mode. State it as their goal in first person.

5. INTERACTION STYLE — How the tutor LLM should engage. Be specific to their mode + confidence + time. The tutor must LEAD WITH RETRIEVAL: open by asking the student to recall or attempt, and keep making the student do the thinking, before you explain. End with a single sentence naming 2-3 CONCRETE misconceptions a student at this level would likely have about THIS SPECIFIC MATERIAL — name the actual concept, not a meta-description.

6. OUTPUT SPEC — The exact deliverable shape. Match the study mode:
   - cram-review: rapid quiz-driven session. Mix of recall and application. Answers in a separate section so the student self-tests first.
   - multi-day-plan: day-by-day schedule with focus topics, 30-45 min sessions, end-of-day quizzes, and spaced practice that revisits earlier days.
   - practice-questions: question sets matched to the assessment format. Multiple choice + short answer for tests/quizzes; essay-style prompts + rubrics for papers/projects.
   - concept-clarification: explanation → analogy → worked example → check-for-understanding loop, one concept at a time.
   - essay-project: thesis development → outline → evidence audit → drafting plan, one stage at a time. NEVER write the essay for the student.

7. SELF-CHECK — Quality control instructions for the tutor LLM (verify alignment with course level; ask clarifying questions before going deep; explain reasoning when pushed back on; don't simply agree). End by telling the tutor that when the session is wrapping up (or the student signals they're done) it should CLOSE with two things: (a) a short, honest recap of the specific concepts the student got wrong or was shaky on, and (b) a tight, ready-to-paste follow-up prompt (a few sentences, not a whole new session) the student can drop into a fresh chat next time — one that assumes this first pass is done and goes straight to hard active recall on exactly those weak spots.

# Format

The student told us which LLM they're using. Use the format below that matches their LLM's preference:
- xml: wrap each section in lowercase snake_case tags like <role>...</role>, <about_me>...</about_me>, <material>...</material>, <goal>...</goal>, <interaction_style>...</interaction_style>, <output_spec>...</output_spec>, <self_check>...</self_check>
- markdown: use ## SECTION_NAME headers (e.g. ## ROLE, ## ABOUT_ME, ## MATERIAL, etc.)
- numbered-steps: prefix each section with "Step N — SECTION_NAME:" (e.g. "Step 1 — ROLE:")

Stay consistent with the chosen format throughout.

# Pedagogy (apply throughout)

- Retrieval practice first: make the student attempt or recall BEFORE you explain. Quiz, don't lecture — self-testing beats re-reading and highlighting.
- Mix question formats: use BOTH multiple-choice and short-answer / free-recall, not just one.
- Force self-explanation: have the student explain WHY something is true and HOW they'd reach an answer, and name the underlying principle, before you confirm.
- Tutoring stance: do not give away answers too quickly; ask questions that make the student think; guide them to discover their own mistakes.
- Brief corrections (1-2 sentences), then immediately re-test the same concept. Spaced practice across days when time allows.
- Scale the scaffolding to the student's confidence: more hints and smaller steps when they're shaky on hard material; harder active recall when they're confident — don't overwhelm a novice with heavy self-explanation.
- For essay/project: coach the process, never write the student's work for them.

# Style

- Direct, not chatty. No "Great question!" or "Let's dive in!"
- Specific over generic. Name actual concepts and actual misconceptions, not abstractions.
- Write as if you ARE the student talking to the tutor LLM — first person ("I'm preparing for...", "what confuses me...")
- The prompt should feel custom for THIS student and THIS material, not template-y
- Do not add any preamble or explanation outside the 7 sections
- Do not say "here is your prompt" or describe what you're about to do
- Begin your response immediately with section 1 (the role section in whatever format)

# Pomfret context

Pomfret School is a U.S. boarding school. Course prefixes: ADV (Advanced), HON (Honors); otherwise Standard. The student will tell you the real course details — use them to ground the role/about-me sections.`;

// v2 is derived from v1 by EXACTLY two anchored content changes (throws at module eval
// if an anchor ever goes missing, so the derivation can never silently no-op):
//   1. INTERACTION STYLE gains confidence calibration (rate sure/unsure/guessing before
//      each reveal; confidently-wrong answers flagged as top priority).
//   2. SELF-CHECK's session-closing recap must be emitted in the exact sentinel wire
//      format from recap-format.ts, so Composed can parse it when pasted back.
function mustReplace(haystack: string, anchor: string, replacement: string): string {
  if (!haystack.includes(anchor)) {
    throw new Error(`opus-full-prompt: v2 derivation anchor missing: "${anchor.slice(0, 60)}..."`);
  }
  return haystack.replace(anchor, replacement);
}

const V1_INTERACTION_ANCHOR =
  'The tutor must LEAD WITH RETRIEVAL: open by asking the student to recall or attempt, and keep making the student do the thinking, before you explain.';

const V1_SELF_CHECK_ANCHOR =
  "End by telling the tutor that when the session is wrapping up (or the student signals they're done) it should CLOSE with two things: (a) a short, honest recap of the specific concepts the student got wrong or was shaky on, and (b) a tight, ready-to-paste follow-up prompt (a few sentences, not a whole new session) the student can drop into a fresh chat next time — one that assumes this first pass is done and goes straight to hard active recall on exactly those weak spots.";

export const OPUS_SYSTEM_PROMPT_V2 = mustReplace(
  mustReplace(
    OPUS_SYSTEM_PROMPT_V1,
    V1_INTERACTION_ANCHOR,
    V1_INTERACTION_ANCHOR +
      ' The tutor must also CALIBRATE CONFIDENCE: before revealing each answer, ask the student to rate how sure they are (sure / unsure / guessing), and when reviewing, explicitly flag confidently-wrong answers as the top priority to fix.',
  ),
  V1_SELF_CHECK_ANCHOR,
  `End by telling the tutor that when the session is wrapping up (or the student signals they're done) it must CLOSE by emitting a session recap in EXACTLY this format — plain lines, markers verbatim, no code fences (fences get mangled when copied out of chat UIs):

${RECAP_START_MARKER}
${RECAP_WEAK_SPOTS_MARKER}
- one bullet per weak spot: the specific concept + what went wrong (honest and concrete)
${RECAP_FOLLOW_UP_MARKER}
a tight, ready-to-paste follow-up prompt (a few sentences, not a whole new session) that assumes this first pass is done and goes straight to hard active recall on exactly those weak spots
${RECAP_END_MARKER}

After the recap, the tutor should tell the student they can paste this recap back into Composed to make their next study prompt smarter.`,
);

// Version → system prompt. Selection happens here (Node-only module); the browser-safe
// template-versions.ts registry stores ids/descriptions ONLY, never prompt text.
export const SYSTEM_PROMPTS: Record<TemplateVersionId, string> = {
  v1: OPUS_SYSTEM_PROMPT_V1,
  v2: OPUS_SYSTEM_PROMPT_V2,
};

// The active system prompt — kept under the original export name so existing imports
// and the directive guard test always track what production actually runs.
export const OPUS_SYSTEM_PROMPT = SYSTEM_PROMPTS[ACTIVE_TEMPLATE_VERSION];

export type OpusFullPromptResult =
  | { ok: true; prompt: string; usage: { input_tokens: number; output_tokens: number } }
  | { ok: false; error: 'api-error' };

const formatHours = (h: number): string => {
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return `${minutes} minutes`;
  }
  if (h < 24) return `${h} hours`;
  const days = Math.round(h / 24);
  return `${days} days`;
};

const buildUserMessage = (inputs: WizardInputs, studentGrade?: string): string => {
  const course = inputs.courseId ? findCourse(inputs.courseId) : null;
  const profile = getModelProfile(inputs.provider, inputs.model);
  const courseLine = course
    ? `Course: ${course.name} (${course.department}, ${course.level})`
    : `Course: ${inputs.courseFreeText ?? 'unspecified'}`;
  const courseDesc = course?.description
    ? `Official Pomfret course description: ${course.description}`
    : '';

  const lines: string[] = [
    courseLine,
    courseDesc,
    studentGrade ? `Student's grade: ${studentGrade}` : '',
    '',
    `Student's LLM: ${inputs.provider} / ${inputs.model}`,
    `Use format: ${profile.format}`,
    '',
    `Study mode: ${STUDY_MODE_LABELS[inputs.mode]} — ${STUDY_MODE_DESCRIPTIONS[inputs.mode]}`,
    '',
    `Assessment: ${inputs.assessmentType} on ${inputs.assessmentDate}`,
    `Time available: ${formatHours(inputs.hoursAvailable)}`,
    '',
    inputs.material
      ? `Material the student shared:\n---\n${inputs.material.slice(0, 8000)}\n---`
      : 'Material: The student did not paste specific material. Instruct the tutor LLM to ask for notes, syllabus, or topic list before going deep.',
    '',
    inputs.attachedMaterialKinds && inputs.attachedMaterialKinds.length > 0
      ? `The student will ATTACH the following to their own LLM when they study: ${describeAttachedKinds(inputs.attachedMaterialKinds)}. Write the Material and Interaction sections so the tutor first reads the attached material, extracts the key topics from it, and quizzes the student on those topics — do NOT assume that material text is inline in this prompt.`
      : '',
    inputs.confidence !== undefined ? `Confidence on this material: ${inputs.confidence}/5` : '',
    inputs.understanding ? `What the student already understands: ${inputs.understanding}` : '',
    inputs.confusion ? `What confuses them: ${inputs.confusion}` : '',
    '',
    `Write the complete 7-section Pomfret-Study prompt for this student now. Use ${profile.format} format throughout.`,
  ];
  // Collapse runs of empty lines.
  const collapsed = lines.filter((line, idx) => {
    if (line === '' && lines[idx - 1] === '') return false;
    return true;
  });
  return collapsed.join('\n');
};

type MessagesCreateParams = Parameters<Anthropic['messages']['create']>[0];
type MessageResponse = {
  content: Array<{ type: string; text?: string } & Record<string, unknown>>;
  usage: { input_tokens: number; output_tokens: number };
};
export type AnthropicLike = {
  messages: {
    create: (params: MessagesCreateParams) => Promise<MessageResponse>;
  };
};

export function makeClient(): AnthropicLike {
  // The Anthropic SDK ships as a class at runtime, but tests may mock it with
  // an arrow function (which JS does not permit invoking with `new`). Try
  // `new` first and fall back to a plain function call so both paths work.
  // 120s: Opus with extended thinking (e.g. the Sharpen revise) can exceed the SDK's 30s
  // default; the base generate finishes well under this, so the larger ceiling is harmless.
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: parseInt(process.env.OPUS_TIMEOUT_MS ?? '120000', 10) };
  try {
    return new (Anthropic as unknown as new (o: typeof opts) => AnthropicLike)(opts);
  } catch {
    const Callable = Anthropic as unknown as (o: typeof opts) => AnthropicLike;
    return Callable(opts);
  }
}

export async function generateFullPromptWithOpus(
  inputs: WizardInputs,
  ragContext: string = '',
  studentGrade?: string,
  // The pipeline passes the version it stamps on the generations row, so the stored
  // template_version always matches the system prompt actually used.
  templateVersion: TemplateVersionId = ACTIVE_TEMPLATE_VERSION,
): Promise<OpusFullPromptResult> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const client = makeClient();
  try {
    const userMessage = buildUserMessage(inputs, studentGrade) + (ragContext ? `\n\n${ragContext}` : '');
    const response = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: 4000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPTS[templateVersion],
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userMessage },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
      console.error('[opus-full-prompt] unexpected response shape', {
        hasKey,
        blockTypes: response.content.map((b) => b.type),
      });
      return { ok: false, error: 'api-error' };
    }
    return {
      ok: true,
      prompt: block.text.trim(),
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  } catch (err) {
    console.error('[opus-full-prompt] Anthropic call failed', {
      hasKey,
      model: OPUS_MODEL,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      // The SDK puts status/headers on the error object for HTTP-level failures
      status: (err as { status?: number })?.status,
    });
    return { ok: false, error: 'api-error' };
  }
}
