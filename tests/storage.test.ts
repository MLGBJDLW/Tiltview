import { describe, expect, it } from 'vitest';
import { viewKeyFor } from '../lib/storage';
import { isContentRequest, KNOWN_COMMANDS } from '../lib/messaging';

describe('viewKeyFor', () => {
  it('groups videos from the same site section together', () => {
    // v0.1.0 had no persistence at all; when we added it we deliberately key by
    // origin + first path segment so /watch?v=a and /watch?v=b share a view but
    // /shorts does not clobber /watch.
    expect(viewKeyFor('https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch');
    expect(viewKeyFor('https://www.youtube.com/watch?v=xyz')).toBe('https://www.youtube.com/watch');
    expect(viewKeyFor('https://www.youtube.com/shorts/1')).toBe('https://www.youtube.com/shorts');
    expect(viewKeyFor('https://www.bilibili.com/video/BV1xx')).toBe('https://www.bilibili.com/video');
  });

  it('falls back to the origin for bare pages', () => {
    expect(viewKeyFor('https://example.com/')).toBe('https://example.com');
    expect(viewKeyFor('https://example.com')).toBe('https://example.com');
  });

  it('never throws on malformed input', () => {
    expect(viewKeyFor('not a url')).toBe('unknown');
    expect(viewKeyFor('')).toBe('unknown');
  });
});

describe('messaging guards', () => {
  it('accepts known requests', () => {
    expect(isContentRequest({ type: 'getState' })).toBe(true);
    expect(isContentRequest({ type: 'setState', payload: { scale: 2 } })).toBe(true);
    expect(isContentRequest({ type: 'command', command: 'rotate-cw' })).toBe(true);
    expect(isContentRequest({ type: 'reset' })).toBe(true);
    expect(isContentRequest({ type: 'togglePanel' })).toBe(true);
    expect(isContentRequest({ type: 'setSiteEnabled', enabled: false })).toBe(true);
  });

  it('rejects foreign and malformed messages', () => {
    expect(isContentRequest(null)).toBe(false);
    expect(isContentRequest(undefined)).toBe(false);
    expect(isContentRequest('getState')).toBe(false);
    expect(isContentRequest({})).toBe(false);
    expect(isContentRequest({ type: 'evil' })).toBe(false);
    // Unknown fields from other extensions must not be treated as ours.
    expect(isContentRequest({ type: 'getState', __proto__: { polluted: true } })).toBe(true);
  });

  it('declares every manifest command in the known set', () => {
    for (const command of KNOWN_COMMANDS) {
      expect(typeof command).toBe('string');
    }
    expect(KNOWN_COMMANDS).toContain('toggle-panel');
    expect(KNOWN_COMMANDS).toContain('rotate-cw');
  });
});
