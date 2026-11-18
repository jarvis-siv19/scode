export type TaskClass = 'review-tests' | 'architecture' | 'aws' | 'exploration' | 'github' | 'general';

export interface Classification {
  taskClass: TaskClass;
  difficulty: 'low' | 'medium' | 'high';
  reason: string;
}

export function classify(brief: string): Classification {
  const text = brief.toLowerCase();
  if (/\b(aws|lambda|cloudformation|cdk|dynamodb)\b/.test(text)) return { taskClass: 'aws', difficulty: 'medium', reason: 'AWS-native keywords' };
  if (/\b(github|pull request|\bpr\b|actions|issue)\b/.test(text)) return { taskClass: 'github', difficulty: 'medium', reason: 'GitHub-native workflow' };
  if (/\b(architecture|architect|large refactor|redesign|migration)\b/.test(text)) return { taskClass: 'architecture', difficulty: 'high', reason: 'architecture/refactor keywords' };
  if (/\b(huge repo|explore|codebase|find where)\b/.test(text)) return { taskClass: 'exploration', difficulty: 'medium', reason: 'repository exploration' };
  if (/\b(review|test|tests|lint|typo)\b/.test(text)) return { taskClass: 'review-tests', difficulty: 'low', reason: 'review/test keywords' };
  return { taskClass: 'general', difficulty: 'medium', reason: 'default rule' };
}
