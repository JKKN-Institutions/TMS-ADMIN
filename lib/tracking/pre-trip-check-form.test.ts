/**
 * The full-screen pre-trip check must never cover END TRIP (W12 review on #27).
 * Rendered to static markup — no browser needed.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreTripCheckForm } from '@/components/driver/pre-trip-check-form';

const base = { routeId: 'route-1', routeLabel: '36 · ERODE', onSaved: () => undefined };
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(PreTripCheckForm, { ...base, ...props }));

describe('PreTripCheckForm', () => {
  it('shows END TRIP over the check while a trip is running', () => {
    const html = render({ onEndTrip: () => undefined });
    expect(html).toContain('END TRIP');
    // Pinned above the overlay (z-50) so nothing in the check can hide it.
    expect(html).toMatch(/fixed inset-x-0 bottom-0 z-\[60\][^"]*"[^>]*>[\s\S]*END TRIP/);
  });

  it('shows the end-trip error next to END TRIP, not behind the check', () => {
    expect(render({ onEndTrip: () => undefined, endTripError: 'Could not end the trip.' })).toContain('Could not end the trip.');
  });

  it('has no END TRIP before a trip starts', () => {
    expect(render({ onClose: () => undefined })).not.toContain('END TRIP');
  });

  it('mid-trip check has no close button; the ways out are save, skip and END TRIP', () => {
    const html = render({ onEndTrip: () => undefined });
    expect(html).not.toContain('Not now');
    expect(html).toContain('Can&#x27;t do the check now?');
  });
});
