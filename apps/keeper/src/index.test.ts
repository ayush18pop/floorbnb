import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/keeper', () => {
  it('loads', () => {
    expect(name).toBe('@floor/keeper');
  });
});
