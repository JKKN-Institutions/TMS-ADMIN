export type ItemResult = 'pass' | 'fail' | 'na';
export type Severity = 'critical' | 'normal';
export type InspectionResult = 'pass' | 'pass_with_issues' | 'fail';

/** Any critical fail → fail; any other fail → pass_with_issues; else pass. */
export function computeResult(items: { severity: Severity; result: ItemResult | null }[]): InspectionResult {
  if (items.some((i) => i.result === 'fail' && i.severity === 'critical')) return 'fail';
  if (items.some((i) => i.result === 'fail')) return 'pass_with_issues';
  return 'pass';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Human-readable reasons the inspection cannot be submitted yet (empty = OK). */
export function submitBlockers(items: { result: ItemResult | null; note: string | null }[]): string[] {
  const out: string[] = [];
  const unanswered = items.filter((i) => !i.result).length;
  const failNoNote = items.filter((i) => i.result === 'fail' && !(i.note ?? '').trim()).length;
  if (unanswered) out.push(`${plural(unanswered, 'item is', 'items are')} not answered`);
  if (failNoNote) out.push(`${plural(failNoNote, 'failed item needs', 'failed items need')} a note`);
  return out;
}
