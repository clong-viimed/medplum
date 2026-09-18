import { expect, test } from 'vitest';
import { AdtmcEvaluationError, evaluateAdtmcRuleTable } from './adtmc-evaluator';

const testRuleTable = {
  algorithmId: 'A-01',
  version: '1.0.0',
  rules: [
    {
      id: 'red-flag',
      conditions: [{ linkId: 'red-flag', operator: 'equals' as const, value: true }],
      disposition: 'provider-now',
      guidance: 'Escalate immediately.',
    },
    {
      id: 'minor-care',
      conditions: [
        { linkId: 'red-flag', operator: 'equals' as const, value: false },
        { linkId: 'screening-complete', operator: 'equals' as const, value: true },
      ],
      disposition: 'minor-care-protocols',
      guidance: 'Continue the configured care pathway.',
    },
  ],
};

test('uses the first matching rule as the deterministic disposition', () => {
  const result = evaluateAdtmcRuleTable(testRuleTable, {
    'red-flag': true,
    'screening-complete': true,
  });

  expect(result).toEqual({
    ruleId: 'red-flag',
    disposition: 'provider-now',
    guidance: 'Escalate immediately.',
  });
});

test('evaluates all conditions before selecting a disposition', () => {
  const result = evaluateAdtmcRuleTable(testRuleTable, {
    'red-flag': false,
    'screening-complete': true,
  });

  expect(result.disposition).toBe('minor-care-protocols');
});

test('fails closed when answers do not satisfy an approved rule', () => {
  expect(() =>
    evaluateAdtmcRuleTable(testRuleTable, {
      'red-flag': false,
      'screening-complete': false,
    })
  ).toThrow(new AdtmcEvaluationError('No disposition rule matched A-01 version 1.0.0'));
});

test('supports explicit numeric thresholds', () => {
  const result = evaluateAdtmcRuleTable(
    {
      algorithmId: 'test',
      version: '1.0.0',
      rules: [
        {
          id: 'threshold',
          conditions: [{ linkId: 'score', operator: 'greater-than', value: 5 }],
          disposition: 'provider-now',
          guidance: 'Escalate.',
        },
      ],
    },
    { score: 6 }
  );

  expect(result.ruleId).toBe('threshold');
});