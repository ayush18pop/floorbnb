import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/bw3', () => {
  it('loads', () => {
    expect(name).toBe('@floor/bw3');
  });
});
