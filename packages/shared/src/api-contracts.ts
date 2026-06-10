import type { WizardInputs, StudyMode } from './types.js';
import type { Interval } from './calendar.js';

// POST /api/generate
export type GenerateResponse = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'sonnet' | 'deterministic';
    // 'opus-capped' appears on sonnet rows (why the middle tier ran), not only fallbacks.
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled' | 'opus-capped';
    generationId: string;  // for use in feedback later
    templateVersion: string;  // prompt-engineering version that produced this (instrumentation)
    usedRecap?: { id: string; createdAt: string };  // recap injected into this prompt (id+date only, never content)
  };
};

// POST /api/feedback
export type FeedbackPayload = {
  generationId: string;
  promptHash: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text?: string;
};
export type FeedbackResponse = { ok: true };

// POST /api/auth/signup, /api/auth/login
export type AuthRequest = { email: string; password: string };
export type AuthResponse = { user: { id: string; email: string; displayName: string | null } };

// GET /api/me
export type MeResponse = {
  user: { id: string; email: string; displayName: string | null };
  profileSummary: string | null;
  gradYear: number | null;
  grade: string | null;
} | { user: null };  // anonymous

// GET /api/me/history
export type HistoryEntry = {
  id: string;
  createdAt: string;  // ISO
  promptText: string;
  llm: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  assessmentType: string | null;
  assessmentDate: string | null;  // ISO date 'YYYY-MM-DD' or null
  rating: number | null;
  ratingText: string | null;
};
export type HistoryResponse = {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
};

// Standard error response shape
export type ErrorResponse = { error: string; issues?: Array<{ path: (string | number)[]; message: string }> };

// POST /api/generate — 429 body. `scope` lets the client tell a shared-IP cap (many
// students behind one campus NAT) apart from a signed-in user's own daily cap.
export type RateLimitedResponse = { error: 'rate_limited'; scope: 'ip' | 'user' };

// Unused so far; kept for parity with WizardInputs imports
export type { WizardInputs };

// GET /api/calendar/freebusy
export type CalendarFreeBusyResponse =
  | { connected: false }
  | { connected: true; busy: Interval[]; freeBlocks: Interval[] };

// POST /api/generate/sharpen
export type SharpenRequest = { generationId: string; basePrompt: string };
export type SharpenResponse =
  | { ok: true; improvedPrompt: string; critique: string }
  | { ok: false; reason: 'unavailable' | 'critic-failed' | 'revise-failed' };

// Canvas integration
export type UpcomingAssessment = {
  id: string;
  title: string;
  course: string | null;
  dueDate: string; // ISO
  type: string;    // 'assignment' | 'quiz' | …
  url: string | null;
};
export type CanvasStatus = { connected: boolean };
export type CanvasConnectResponse = { connected: boolean; reason?: 'invalid-token' };
export type CanvasUpcomingResponse = { connected: boolean; items: UpcomingAssessment[]; reason?: 'reconnect' | 'canvas-unavailable' };

// POST /api/recap — session recap capture (signed-in only; PERSONAL-ONLY; never echoed back)
export type RecapRequest = { generationId: string; text: string };
// `parsed` = the paste matched the sentinel wire format (recap-format.ts) and
// structured weak spots were extracted. Never echoes any recap content.
export type RecapResponse = { ok: true; recapId: string; parsed: boolean };
