import Anthropic from '@anthropic-ai/sdk';
import type { WizardInputs } from '@/lib/types';
import { STUDY_MODE_LABELS } from '@/lib/templates';
import { findCourse } from '@/lib/courses';

const SONNET_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You write the "Interaction Style" section of a study prompt that another student will paste into ChatGPT, Claude, or Gemini.

Output requirements:
- 3-6 sentences, plain text only. No markdown, no headers, no lists.
- Start with "Interaction style: " (those two words exactly).
- Tailor to the student's mode, confidence level, time available, and the specific course material they shared.
- Include a single "Anticipated misconceptions:" sentence at the end naming 2-3 specific misconceptions a student at this level might bring to this material. Be concrete — name the actual concept, not a meta-description.

Style rules:
- Direct, not chatty. No filler ("Great question!", "Let's dive in!").
- Pedagogically informed: spaced practice, active recall, formative checks.
- Do not lecture. Do not be vague.`;

export type InteractionStyleResult =
  | { ok: true; text: string; usage: { input_tokens: number; output_tokens: number } }
  | { ok: false; error: 'api-error' };

const buildUserMessage = (inputs: WizardInputs): string => {
  const course = inputs.courseId ? findCourse(inputs.courseId) : null;
  const courseLabel = course ? `${course.name} (${course.department}, ${course.level})` : inputs.courseFreeText ?? 'an unspecified course';
  const lines = [
    `Course: ${courseLabel}`,
    `Mode: ${STUDY_MODE_LABELS[inputs.mode]}`,
    `Assessment: ${inputs.assessmentType} on ${inputs.assessmentDate}`,
    `Hours available: ${inputs.hoursAvailable}`,
    inputs.confidence !== undefined ? `Confidence (1-5): ${inputs.confidence}` : null,
    inputs.understanding ? `What I understand: ${inputs.understanding}` : null,
    inputs.confusion ? `What confuses me: ${inputs.confusion}` : null,
    inputs.material ? `Material:\n${inputs.material.slice(0, 4000)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

type MessagesCreateParams = Parameters<Anthropic['messages']['create']>[0];
type MessageResponse = {
  content: Array<{ type: string; text?: string } & Record<string, unknown>>;
  usage: { input_tokens: number; output_tokens: number };
};
type AnthropicLike = {
  messages: {
    create: (params: MessagesCreateParams) => Promise<MessageResponse>;
  };
};

function makeClient(): AnthropicLike {
  // The Anthropic SDK ships as a class at runtime, but tests may mock it with
  // an arrow function (which JS does not permit invoking with `new`). Try
  // `new` first and fall back to a plain function call so both paths work.
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
  try {
    return new (Anthropic as unknown as new (o: typeof opts) => AnthropicLike)(opts);
  } catch {
    const Callable = Anthropic as unknown as (o: typeof opts) => AnthropicLike;
    return Callable(opts);
  }
}

export async function generateInteractionStyle(
  inputs: WizardInputs,
): Promise<InteractionStyleResult> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const client = makeClient();
  try {
    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: buildUserMessage(inputs) },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
      console.error('[interaction-style] unexpected response shape', {
        hasKey,
        blockTypes: response.content.map((b) => b.type),
      });
      return { ok: false, error: 'api-error' };
    }
    return {
      ok: true,
      text: block.text.trim(),
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  } catch (err) {
    console.error('[interaction-style] Anthropic call failed', {
      hasKey,
      model: SONNET_MODEL,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      // The SDK puts status/headers on the error object for HTTP-level failures
      status: (err as { status?: number })?.status,
    });
    return { ok: false, error: 'api-error' };
  }
}
