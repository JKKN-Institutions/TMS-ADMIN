import { describe, it, expect } from 'vitest';
import { withoutTicketPhrase, speak, primeSpeech } from './announce';

describe('withoutTicketPhrase', () => {
  it('names the learner', () => {
    expect(withoutTicketPhrase('Priya S')).toBe('Priya S, without ticket');
  });

  it('tidies stray spaces', () => {
    expect(withoutTicketPhrase('  Arun   Kumar ')).toBe('Arun Kumar, without ticket');
  });

  it('still announces when the name is unknown', () => {
    expect(withoutTicketPhrase(null)).toBe('Learner without ticket');
    expect(withoutTicketPhrase('')).toBe('Learner without ticket');
    // The scan route's own fallback name.
    expect(withoutTicketPhrase('Learner')).toBe('Learner without ticket');
  });
});

describe('speak / primeSpeech without a browser', () => {
  it('does nothing and does not throw', () => {
    expect(() => speak('hello')).not.toThrow();
    expect(() => primeSpeech()).not.toThrow();
  });
});
