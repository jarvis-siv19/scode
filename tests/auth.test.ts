import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeAuth, parseCodexAuth, parseOpenCodeProviders } from '../dist/core/auth.js';

test('auth: identifies ChatGPT without exposing account details', () => {
  assert.equal(parseCodexAuth('Logged in using ChatGPT'), 'ChatGPT');
  assert.equal(parseCodexAuth('Not logged in'), null);
});

test('auth: identifies Claude provider-backed authentication', () => {
  assert.equal(parseClaudeAuth({ loggedIn: true, authMethod: 'third_party', apiProvider: 'bedrock' }), 'Amazon Bedrock');
  assert.equal(parseClaudeAuth({ loggedIn: true, authMethod: 'third_party', apiProvider: 'vertex' }), 'Google Vertex AI');
  assert.equal(parseClaudeAuth({ loggedIn: false }), null);
});

test('auth: summarizes OpenCode providers and omits test credentials', () => {
  assert.equal(
    parseOpenCodeProviders({ 'amazon-bedrock': {}, 'github-copilot': {}, nvidia: {}, testing: {} }),
    'Bedrock + GitHub Copilot + NVIDIA',
  );
});
