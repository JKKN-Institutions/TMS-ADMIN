import { describe, it, expect } from 'vitest';
import { buildPushPayload, shouldPruneStatus } from './push';

describe('buildPushPayload', () => {
  it('serializes the fields the SW push handler reads', () => {
    const json = buildPushPayload({
      title: 'Bus delayed', body: 'Route 5 is 10m late',
      url: '/student/routes', icon: '/icons/icon-192.png', tag: 'n1', priority: 'high',
    });
    expect(JSON.parse(json)).toEqual({
      title: 'Bus delayed', body: 'Route 5 is 10m late',
      url: '/student/routes', icon: '/icons/icon-192.png', tag: 'n1', priority: 'high',
    });
  });

  it('defaults url and icon when empty', () => {
    const json = buildPushPayload({ title: 'T', body: 'B', url: '', icon: '', tag: 't', priority: '' });
    const parsed = JSON.parse(json);
    expect(parsed.url).toBe('/');
    expect(parsed.icon).toBe('/icons/icon-192.png');
    expect(parsed.priority).toBe('normal');
  });
});

describe('shouldPruneStatus', () => {
  it('prunes on 404 and 410 (subscription gone)', () => {
    expect(shouldPruneStatus(404)).toBe(true);
    expect(shouldPruneStatus(410)).toBe(true);
  });
  it('keeps the subscription on transient/other errors', () => {
    expect(shouldPruneStatus(429)).toBe(false);
    expect(shouldPruneStatus(500)).toBe(false);
    expect(shouldPruneStatus(201)).toBe(false);
  });
});
