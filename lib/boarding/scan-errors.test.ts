import { describe, it, expect } from 'vitest';
import { cameraErrorMessage } from './scan-errors';

describe('cameraErrorMessage', () => {
  it('maps permission-denied to a permission message', () => {
    expect(cameraErrorMessage('permission-denied')).toMatch(/permission/i);
  });

  it('maps no-camera to a no-camera message', () => {
    expect(cameraErrorMessage('no-camera')).toMatch(/no camera/i);
  });

  it('maps in-use to an in-use message', () => {
    expect(cameraErrorMessage('in-use')).toMatch(/in use/i);
  });

  it('maps insecure-context to a secure/HTTPS message', () => {
    expect(cameraErrorMessage('insecure-context')).toMatch(/https|secure/i);
  });

  it('falls back to a generic message for an unknown kind', () => {
    expect(cameraErrorMessage('unknown')).toMatch(/could not start camera/i);
  });

  it('falls back to a generic message when kind is undefined', () => {
    expect(cameraErrorMessage(undefined)).toMatch(/could not start camera/i);
  });

  it('always steers the user to manual entry', () => {
    const kinds: Array<string | undefined> = [
      'permission-denied', 'no-camera', 'in-use', 'insecure-context',
      'unsupported', 'overconstrained', 'unknown', undefined,
    ];
    for (const kind of kinds) {
      expect(cameraErrorMessage(kind)).toMatch(/manual entry/i);
    }
  });
});
