// Reads the query string of /api/cron/attention-digest.
//
// Strict on purpose. The real run takes NO parameters, so anything that is not
// exactly a known flag is refused rather than ignored: a mistyped preview
// (`?dryRun=true`, `?dryrun=1`) must come back as an error, never fall through
// to mailing the transport heads.

export type DigestRequest =
  | { ok: true; mode: 'run' }
  | { ok: true; mode: 'dryRun' }
  | { ok: true; mode: 'test'; testTo: string }
  | { ok: false; error: string };

const KNOWN = new Set(['dryRun', 'testTo']);

export function parseDigestRequest(params: URLSearchParams): DigestRequest {
  const unknown = [...new Set(params.keys())].filter((k) => !KNOWN.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown parameter: ${unknown.join(', ')}. Use dryRun=1 or testTo=<address>.`,
    };
  }

  const dryRun = params.get('dryRun');
  const testTo = params.get('testTo');
  if (dryRun !== null && testTo !== null) {
    return { ok: false, error: 'Use dryRun=1 or testTo=<address>, not both.' };
  }
  if (dryRun !== null) {
    return dryRun === '1'
      ? { ok: true, mode: 'dryRun' }
      : { ok: false, error: 'dryRun must be exactly 1.' };
  }
  if (testTo !== null) {
    return testTo.trim()
      ? { ok: true, mode: 'test', testTo }
      : { ok: false, error: 'testTo needs an address.' };
  }
  return { ok: true, mode: 'run' };
}
