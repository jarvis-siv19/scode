import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../dist/core/classifier.js';

test('classify: AWS keywords route to aws', () => {
  assert.equal(classify('deploy this lambda to AWS').taskClass, 'aws');
});

test('classify: GitHub keywords route to github', () => {
  assert.equal(classify('open a pull request for this change').taskClass, 'github');
});

test('classify: architecture keywords route to architecture with high difficulty', () => {
  const result = classify('redesign the auth module architecture');
  assert.equal(result.taskClass, 'architecture');
  assert.equal(result.difficulty, 'high');
});

test('classify: exploration keywords route to exploration', () => {
  assert.equal(classify('explore the codebase and find where auth lives').taskClass, 'exploration');
});

test('classify: review/test keywords route to review-tests with low difficulty', () => {
  const result = classify('review this change and add tests');
  assert.equal(result.taskClass, 'review-tests');
  assert.equal(result.difficulty, 'low');
});

test('classify: free-model keywords route to free-model', () => {
  assert.equal(classify('quick question: what does this function do').taskClass, 'free-model');
});

test('classify: deep-reasoning keywords route to deep-reasoning', () => {
  assert.equal(classify('deep reasoning needed: prove this algorithm terminates').taskClass, 'deep-reasoning');
});

test('classify: unmatched briefs fall back to general', () => {
  assert.equal(classify('fix the thing in the file').taskClass, 'general');
});
