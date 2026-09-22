import { describe, it, expect } from 'vitest';
import { classifyCard } from './card';

describe('classifyCard', () => {
  it('jkkn id, dash form', () => {
    expect(classifyCard('123457-2')).toEqual({ shape: 'jkkn_id', code: '123457-2' });
  });

  it('7 bare digits classify as jkkn_id, not id_code', () => {
    expect(classifyCard('1234572')).toEqual({ shape: 'jkkn_id', code: '123457-2' });
  });

  it('CRLF and surrounding whitespace are stripped before classifying', () => {
    expect(classifyCard('\r\n 1234572 \r\n')).toEqual({ shape: 'jkkn_id', code: '123457-2' });
  });

  it('Code 39 start/stop asterisks are stripped to yield an id_code', () => {
    expect(classifyCard('*ES24031*')).toEqual({ shape: 'id_code', code: 'ES24031' });
  });

  it('Code 39 asterisks with surrounding spaces are stripped too', () => {
    expect(classifyCard(' * ES24031 * ')).toEqual({ shape: 'id_code', code: 'ES24031' });
  });

  it('lower-case roll number is uppercased as an id_code', () => {
    expect(classifyCard('es24031')).toEqual({ shape: 'id_code', code: 'ES24031' });
  });

  it('roll number containing a dot is a valid id_code', () => {
    expect(classifyCard('ab.123')).toEqual({ shape: 'id_code', code: 'AB.123' });
  });

  it('UUID (lower-case) classifies as uuid', () => {
    expect(classifyCard('550e8400-e29b-41d4-a716-446655440000')).toEqual({
      shape: 'uuid',
      code: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('UUID upper-case is normalized to lower-case', () => {
    expect(classifyCard('550E8400-E29B-41D4-A716-446655440000')).toEqual({
      shape: 'uuid',
      code: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('empty string is unknown', () => {
    expect(classifyCard('')).toEqual({ shape: 'unknown', code: '' });
  });

  it('junk (all-letters, length 1) is unknown', () => {
    expect(classifyCard('A')).toEqual({ shape: 'unknown', code: 'A' });
  });

  it('a 40-character string exceeds the id_code length and is unknown', () => {
    const junk = 'A'.repeat(40);
    expect(classifyCard(junk)).toEqual({ shape: 'unknown', code: junk });
  });
});
