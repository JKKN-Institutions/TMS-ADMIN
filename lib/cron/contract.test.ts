// proxy.ts allowlists every request under /api/cron/ so it never runs the
// normal session-auth gate on these routes — each cron route's own
// `CRON_SECRET` check is its ONLY auth. That contract has so far lived only
// as a comment in each route file; this test turns it into a build break: if
// a route is added (or edited) without checking CRON_SECRET first, `vitest
// run` fails instead of the route silently going unauthenticated behind the
// proxy allowlist.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CRON_DIR = join(process.cwd(), 'app', 'api', 'cron');

function findCronRouteFiles(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(CRON_DIR)) {
    const routePath = join(CRON_DIR, entry, 'route.ts');
    try {
      if (statSync(routePath).isFile()) files.push(routePath);
    } catch {
      // not a route directory — ignore
    }
  }
  return files;
}

describe('cron route CRON_SECRET contract', () => {
  const routeFiles = findCronRouteFiles();

  it('finds at least one /api/cron/*/route.ts file', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of routeFiles) {
    describe(filePath, () => {
      const source = readFileSync(filePath, 'utf8');

      it('reads process.env.CRON_SECRET', () => {
        expect(source).toContain('process.env.CRON_SECRET');
      });

      it('checks CRON_SECRET before creating a service-role client', () => {
        const secretIdx = source.indexOf('process.env.CRON_SECRET');
        const serviceRoleIdx = source.indexOf('createServiceRoleClient(');
        expect(secretIdx).toBeGreaterThanOrEqual(0);
        // A route with no service-role call at all still passes trivially
        // (indexOf returns -1) — the point is that IF one exists, the secret
        // check happens first.
        if (serviceRoleIdx !== -1) {
          expect(secretIdx).toBeLessThan(serviceRoleIdx);
        }
      });

      it('responds 401 when unauthorized', () => {
        expect(source).toContain('status: 401');
      });
    });
  }
});
