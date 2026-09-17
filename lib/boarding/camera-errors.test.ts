import { describe, it, expect } from 'vitest';
import {
  classifyCameraError,
  cameraErrorMessage,
  shouldTryOtherCameras,
  pickBackCamera,
  isFreshCapture,
  PHOTO_MAX_AGE_MS,
} from './camera-errors';

describe('classifyCameraError', () => {
  it('reads the reason out of html5-qrcode start() strings', () => {
    expect(classifyCameraError('Error getting userMedia, error = NotAllowedError: Permission denied')).toBe('blocked');
    expect(classifyCameraError('Error getting userMedia, error = NotReadableError: Could not start video source')).toBe('busy');
    expect(classifyCameraError('Error getting userMedia, error = NotFoundError: Requested device not found')).toBe('no_camera');
    expect(classifyCameraError('Error getting userMedia, error = OverconstrainedError')).toBe('constraints');
    expect(classifyCameraError('Camera streaming not supported by the browser.')).toBe('unsupported');
  });

  it('reads DOMException objects too', () => {
    expect(classifyCameraError({ name: 'NotAllowedError', message: 'x' })).toBe('blocked');
    expect(classifyCameraError(new Error('AbortError: Timeout starting video source'))).toBe('busy');
  });

  it('treats anything else as unknown, including nothing', () => {
    expect(classifyCameraError('some other failure')).toBe('unknown');
    expect(classifyCameraError(undefined)).toBe('unknown');
  });
});

describe('cameraErrorMessage', () => {
  it('always ends by offering the photo scan', () => {
    for (const k of ['blocked', 'busy', 'no_camera', 'constraints', 'unsupported', 'unknown'] as const) {
      expect(cameraErrorMessage(k)).toMatch(/Scan from photo/);
    }
  });

  it('tells a blocked phone how to allow the camera', () => {
    expect(cameraErrorMessage('blocked')).toMatch(/Allow/);
  });
});

describe('shouldTryOtherCameras', () => {
  it('does not retry when the user or the browser forbids the camera', () => {
    expect(shouldTryOtherCameras('blocked')).toBe(false);
    expect(shouldTryOtherCameras('unsupported')).toBe(false);
  });
  it('retries when a different camera might work', () => {
    expect(shouldTryOtherCameras('busy')).toBe(true);
    expect(shouldTryOtherCameras('constraints')).toBe(true);
    expect(shouldTryOtherCameras('unknown')).toBe(true);
  });
});

describe('pickBackCamera', () => {
  it('prefers a camera labelled back/rear, else the last one', () => {
    expect(pickBackCamera([{ id: 'f', label: 'camera2 1, facing front' }, { id: 'b', label: 'camera2 0, facing back' }])).toBe('b');
    expect(pickBackCamera([{ id: 'a', label: '' }, { id: 'z', label: '' }])).toBe('z');
    expect(pickBackCamera([])).toBeNull();
  });
});

describe('isFreshCapture', () => {
  const now = 1_000_000_000_000;
  it('accepts a photo taken just now', () => {
    expect(isFreshCapture({ lastModified: now - 5_000 }, now)).toBe(true);
  });
  it('refuses an old gallery image', () => {
    expect(isFreshCapture({ lastModified: now - PHOTO_MAX_AGE_MS - 1 }, now)).toBe(false);
  });
  it('refuses a timestamp from the future beyond clock slack, or none', () => {
    expect(isFreshCapture({ lastModified: now + 10 * 60_000 }, now)).toBe(false);
    expect(isFreshCapture({ lastModified: 0 }, now)).toBe(false);
  });
});
