import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/db', () => {
  it('loads', () => {
    expect(name).toBe('@floor/db');
  });
});
