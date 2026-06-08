import { describe, it, expect, afterEach } from 'vitest';
import {
  getActiveTemplateVersion,
  ACTIVE_TEMPLATE_VERSION,
  TEMPLATE_VERSIONS,
} from '@composed-prompts/shared';

describe('template version registry', () => {
  afterEach(() => {
    delete process.env.TEMPLATE_AB_ENABLED;
  });

  it('registers exactly one version (v1)', () => {
    expect(Object.keys(TEMPLATE_VERSIONS)).toEqual(['v1']);
    expect(TEMPLATE_VERSIONS.v1.id).toBe('v1');
    expect(typeof TEMPLATE_VERSIONS.v1.description).toBe('string');
    expect(ACTIVE_TEMPLATE_VERSION).toBe('v1');
  });

  it("returns 'v1' by default", () => {
    expect(getActiveTemplateVersion()).toBe('v1');
    expect(getActiveTemplateVersion({ seed: 'user-123' })).toBe('v1');
  });

  it('bucketing is a guaranteed no-op with one registered version, even when A/B is enabled', () => {
    process.env.TEMPLATE_AB_ENABLED = '1';
    for (const seed of ['a', 'b', 'c', 'user-1', 'user-2', 'ip:deadbeef', '']) {
      expect(getActiveTemplateVersion({ seed })).toBe('v1');
    }
  });
});
