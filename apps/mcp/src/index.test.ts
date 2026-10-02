import { describe, expect, it } from 'vitest';
import { name } from './index';

describe('@floor/mcp', () => {
  it('loads', () => {
    expect(name).toBe('@floor/mcp');
  });
});
