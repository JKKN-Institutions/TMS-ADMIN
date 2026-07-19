import { describe, it, expect } from 'vitest';
import { buildReplyNotification } from './notify';

describe('buildReplyNotification', () => {
  it('puts the display id in the title when present', () => {
    expect(buildReplyNotification('BUG-489', 'hello').title).toBe(
      'Reply to your bug report (BUG-489)',
    );
  });

  it('omits the parenthetical when the display id is null or blank', () => {
    expect(buildReplyNotification(null, 'hi').title).toBe('Reply to your bug report');
    expect(buildReplyNotification('   ', 'hi').title).toBe('Reply to your bug report');
  });

  it('trims the body', () => {
    expect(buildReplyNotification('BUG-1', '  hi  ').body).toBe('hi');
  });

  it('caps the body at 4000 characters', () => {
    expect(buildReplyNotification('BUG-1', 'x'.repeat(5000)).body).toHaveLength(4000);
  });
});
