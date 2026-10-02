import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/sdk', () => {
  it('loads', () => {
    expect(name).toBe('@floor/sdk');
  });
});
