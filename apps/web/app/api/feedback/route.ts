import { NextRequest, NextResponse } from 'next/server';
import { FeedbackPayloadSchema } from '@composed-prompts/shared';
import { kv } from '@/lib/kv';

const KEY = (hash: string): string => `feedback:${hash}`;

type FeedbackAggregate = {
  count: number;
  sum: number;
  recentTexts: string[];
  provider: string;
  model: string;
  mode: string;
  courseId: string | null;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = FeedbackPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  try {
    const client = await kv();
    const key = KEY(parsed.data.promptHash);
    const current = (await client.get<FeedbackAggregate>(key)) ?? {
      count: 0,
      sum: 0,
      recentTexts: [],
      provider: parsed.data.provider,
      model: parsed.data.model,
      mode: parsed.data.mode,
      courseId: parsed.data.courseId,
    };
    const next: FeedbackAggregate = {
      ...current,
      count: current.count + 1,
      sum: current.sum + parsed.data.rating,
      recentTexts: parsed.data.text
        ? [parsed.data.text, ...current.recentTexts].slice(0, 10)
        : current.recentTexts,
    };
    await client.set(key, next, { ex: 60 * 60 * 24 * 365 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: 'storage-unavailable' }, { status: 200 });
  }
}
