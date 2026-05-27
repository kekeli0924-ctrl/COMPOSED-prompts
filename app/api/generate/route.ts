import { NextRequest, NextResponse } from 'next/server';
import { WizardInputsSchema } from '@/lib/validation/wizard-inputs';
import { runPipeline } from '@/lib/generation/pipeline';
import { checkAndRecord } from '@/lib/rate-limit/sliding-window';

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? '20', 10);

const getIp = (req: NextRequest): string => {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const redactInputs = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null) return body;
  const { material, understanding, confusion, ...rest } = body as Record<string, unknown>;
  return {
    ...rest,
    material: material ? '[redacted]' : undefined,
    understanding: understanding ? '[redacted]' : undefined,
    confusion: confusion ? '[redacted]' : undefined,
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = WizardInputsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const ip = getIp(req);
  const limit = await checkAndRecord(ip, { limit: RATE_LIMIT, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limit exceeded; try again tomorrow' },
      { status: 429 },
    );
  }

  try {
    const result = await runPipeline(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('generate failed', {
      message: err instanceof Error ? err.message : 'unknown',
      input: redactInputs(parsed.data),
    });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
