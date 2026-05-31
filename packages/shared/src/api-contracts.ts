import type { WizardInputs, StudyMode } from './types.js';
import type { Interval } from './calendar.js';

// POST /api/generate
export type GenerateResponse = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    generationId: string;  // for use in feedback later
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
