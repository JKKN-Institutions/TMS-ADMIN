// A minimal, chainable stand-in for a Supabase client, enough to drive
// lib/fees/generate.ts in tests without a database.
//
// It deliberately does NOT implement filtering: the real filtering happens in
// SQL, so a test supplies the rows a query WOULD have returned, keyed by table.
// That keeps these tests about orchestration (who gets billed, what is
// counted) rather than re-implementing PostgREST.

export interface FakeCall {
  table: string;
  ops: Array<[string, unknown[]]>;
}

export interface FakeSupabaseOptions {
  /** Force an error for a given table, to test fail-loud paths. */
  errors?: Record<string, { message: string; code?: string }>;
  /** Force an error only on INSERT into a given table. */
  insertErrors?: Record<string, { message: string; code?: string }>;
}

export interface FakeSupabase {
  from: (table: string) => any;
  rpc: (...args: unknown[]) => Promise<{ data: unknown; error: null }>;
  /** Every query issued, in order — assert on this to prove chunking etc. */
  calls: FakeCall[];
}

const CHAINABLE = [
  'select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'gte', 'lte',
] as const;

export function makeFakeSupabase(
  data: Record<string, unknown[]>,
  opts: FakeSupabaseOptions = {}
): FakeSupabase {
  const calls: FakeCall[] = [];
  let insertSeq = 0;

  function builder(table: string) {
    const call: FakeCall = { table, ops: [] };
    calls.push(call);

    const rows = () => (data[table] ?? []) as unknown[];
    const err = () => opts.errors?.[table] ?? null;

    const b: any = {};
    for (const op of CHAINABLE) {
      b[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: err() });
    b.single = async () => ({ data: rows()[0] ?? null, error: err() });

    b.insert = (payload: unknown) => {
      call.ops.push(['insert', [payload]]);
      const insErr = opts.insertErrors?.[table] ?? err();
      const id = `fake-${table}-${++insertSeq}`;
      const ins: any = {
        select: () => ins,
        single: async () => ({ data: insErr ? null : { id }, error: insErr }),
        maybeSingle: async () => ({ data: insErr ? null : { id }, error: insErr }),
      };
      // Awaitable without .select()
      ins.then = (res: any, rej: any) =>
        Promise.resolve({ data: null, error: insErr }).then(res, rej);
      return ins;
    };

    b.update = (payload: unknown) => {
      call.ops.push(['update', [payload]]);
      return b;
    };
    b.delete = () => {
      call.ops.push(['delete', []]);
      return b;
    };

    // Make the builder itself awaitable, resolving to the canned rows.
    b.then = (res: any, rej: any) =>
      Promise.resolve({ data: rows(), error: err() }).then(res, rej);

    return b;
  }

  return {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    calls,
  };
}
