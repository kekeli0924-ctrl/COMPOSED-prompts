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

  it('registers v1 and v2, with v2 active', () => {
    expect(Object.keys(TEMPLATE_VERSIONS).sort()).toEqual(['v1', 'v2']);
    expect(TEMPLATE_VERSIONS.v1.id).toBe('v1');
    expect(TEMPLATE_VERSIONS.v2.id).toBe('v2');
    expect(typeof TEMPLATE_VERSIONS.v2.description).toBe('string');
    expect(ACTIVE_TEMPLATE_VERSION).toBe('v2');
  });

  it("returns 'v2' when TEMPLATE_AB_ENABLED is unset, for any seed", () => {
    // With two versions registered the A/B hook is no longer structurally inert —
    // this pins that the flag (defaulting off) is the only thing keeping it off.
    expect(process.env.TEMPLATE_AB_ENABLED).toBeUndefined();
    expect(getActiveTemplateVersion()).toBe('v2');
    for (const seed of ['a', 'b', 'user-1', 'user-2', 'ip:deadbeef', '']) {
      expect(getActiveTemplateVersion({ seed })).toBe('v2');
    }
  });

  it("returns 'v2' even when the flag is set but no seed is supplied", () => {
    process.env.TEMPLATE_AB_ENABLED = '1';
    expect(getActiveTemplateVersion()).toBe('v2');
    expect(getActiveTemplateVersion({})).toBe('v2');
  });

  it('buckets deterministically across registered versions only when flag AND seed are present', () => {
    process.env.TEMPLATE_AB_ENABLED = '1';
    for (const seed of ['user-1', 'user-2', 'user-3', 'user-4']) {
      const v = getActiveTemplateVersion({ seed });
      expect(['v1', 'v2']).toContain(v);
      expect(getActiveTemplateVersion({ seed })).toBe(v); // same seed → same bucket
    }
  });
});
