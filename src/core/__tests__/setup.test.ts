import { describe, it, expect } from 'vitest';

describe('Vitest setup', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string assertions', () => {
    expect('gaca-core').toContain('gaca');
  });

  it('should handle object assertions', () => {
    const weights = { successRate: 0.4, latency: 0.3, quality: 0.3 };
    expect(weights.successRate + weights.latency + weights.quality).toBeCloseTo(1.0);
  });
});
