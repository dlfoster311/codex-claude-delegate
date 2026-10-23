import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from './clamp.mjs';
test('clamp handles interior, lower, upper, negative, and equal bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-5, -10, -1), -5);
  assert.equal(clamp(9, 3, 3), 3);
});
