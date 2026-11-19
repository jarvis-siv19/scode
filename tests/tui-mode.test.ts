import test from 'node:test';
import assert from 'node:assert/strict';
import { isConversationalBrief } from '../dist/tui/App.js';

test('tui: greetings use the lightweight chat path', () => {
  for (const brief of ['hi', 'Hi!', 'hello', 'hey', 'good morning', 'thank you']) {
    assert.equal(isConversationalBrief(brief), true);
  }
  assert.equal(isConversationalBrief('hey there'), false);
  assert.equal(isConversationalBrief('fix the login bug'), false);
  assert.equal(isConversationalBrief('say hi in the README'), false);
});
