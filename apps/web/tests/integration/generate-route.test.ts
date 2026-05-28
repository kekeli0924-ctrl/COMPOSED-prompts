import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRunPipeline, mockCheckAndRecord } = vi.hoisted(() => ({
  mockRunPipeline: vi.fn(),
  mockCheckAndRecord: vi.fn(),
}));

vi.mock('@/lib/generation/pipeline', () => ({
  runPipeline: mockRunPipeline,
}));

vi.mock('@/lib/rate-limit/sliding-window', () => ({
  checkAndRecord: mockCheckAndRecord,
}));

import { POST } from '@/app/api/generate/route';

const validBody = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
};

const makeRequest = (body: unknown, ip = '1.2.3.4'): NextRequest => {
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
};

describe('POST /api/generate', () => {
  beforeEach(() => {
    mockRunPipeline.mockReset();
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 19 });
    mockRunPipeline.mockResolvedValue({
      prompt: 'fake prompt',
      metadata: { generator: 'deterministic', promptHash: 'a'.repeat(64), fallbackReason: 'api-error' },
    });
  });

  it('returns 200 with generated prompt', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prompt).toBe('fake prompt');
    expect(json.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(json.metadata.generator).toBe('deterministic');
  });

  it('returns 400 on invalid input', async () => {
    const res = await POST(makeRequest({ ...validBody, mode: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  it('does not log pasted material on error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRunPipeline.mockRejectedValueOnce(new Error('boom'));
    await POST(makeRequest({ ...validBody, material: 'super secret notes' }));
    const logged = consoleSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('super secret notes');
    consoleSpy.mockRestore();
  });
});
