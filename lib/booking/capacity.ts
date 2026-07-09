/**
 * Pure seat-count decision shared by the booking + scan routes. Capacity is
 * ADVISORY: an over-capacity booking/boarding is allowed and only flagged, never
 * blocked. A non-positive capacity means "no known limit" -> never over capacity
 * (mirrors the historical `cap > 0` guard).
 */
export function isOverCapacity(booked: number, capacity: number): boolean {
  return capacity > 0 && booked >= capacity;
}
