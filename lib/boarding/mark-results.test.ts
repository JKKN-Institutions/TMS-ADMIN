import { describe, expect, it } from 'vitest';
import { buildMarkResults } from './mark-results';
import type { RpcMarkOutcome } from './mark-batch';

const out = (learner_id: string, outcome: RpcMarkOutcome['outcome'], existing_by: string | null = null): RpcMarkOutcome => ({
  learner_id, outcome, existing_status: null, existing_by, existing_at: null,
});
const names = (id: string | null) => (id === 'p-kavya' ? 'Kavya' : 'another staff member');

describe('buildMarkResults', () => {
  it('maps every saved outcome to a saved result carrying walkUp', () => {
    const r = buildMarkResults({
      rejected: [],
      sent: [
        { clientId: 'a', walkUp: false },
        { clientId: 'b', walkUp: true },
        { clientId: 'c', walkUp: false },
        { clientId: 'd', walkUp: false },
      ],
      outcomes: [out('1', 'inserted'), out('2', 'inserted'), out('3', 'updated_own'), out('4', 'noop_same_status')],
      markerName: names,
    });
    expect(r).toEqual([
      { clientId: 'a', outcome: 'inserted', walkUp: false },
      { clientId: 'b', outcome: 'inserted', walkUp: true },
      { clientId: 'c', outcome: 'updated_own', walkUp: false },
      { clientId: 'd', outcome: 'noop_same_status', walkUp: false },
    ]);
  });

  it('names the holder of a locked mark', () => {
    const r = buildMarkResults({
      rejected: [], sent: [{ clientId: 'a', walkUp: false }],
      outcomes: [out('1', 'locked', 'p-kavya')], markerName: names,
    });
    expect(r).toEqual([{ clientId: 'a', outcome: 'locked', markedByName: 'Kavya' }]);
  });

  it('passes rejections through and puts them first', () => {
    const r = buildMarkResults({
      rejected: [{ clientId: 'x', reason: 'stale' }],
      sent: [{ clientId: 'a', walkUp: false }],
      outcomes: [out('1', 'overridden')], markerName: names,
    });
    expect(r).toEqual([
      { clientId: 'x', outcome: 'rejected', reason: 'stale' },
      { clientId: 'a', outcome: 'overridden', walkUp: false },
    ]);
  });

  it('leaves out marks with no clientId (older clients)', () => {
    const r = buildMarkResults({
      rejected: [{ reason: 'invalid' }],
      sent: [{ walkUp: false }],
      outcomes: [out('1', 'inserted')], markerName: names,
    });
    expect(r).toEqual([]);
  });
});
