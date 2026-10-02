import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/api', () => {
  it('loads', () => {
    expect(name).toBe('@floor/api');
  });
});
