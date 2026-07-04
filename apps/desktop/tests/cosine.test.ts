import { describe, it, expect } from 'vitest';
import { cosine } from '../src/main/memory/cosine';

describe('cosine', () => {
  it('相同向量=1', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it('正交=0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it('近似向量中间值', () => {
    const r = cosine([1, 1], [1, 1.5]);
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThan(1);
  });
  it('长度不等返回 0', () => {
    expect(cosine([1, 2], [1])).toBe(0);
  });
  it('空数组返回 0', () => {
    expect(cosine([], [])).toBe(0);
  });
});
