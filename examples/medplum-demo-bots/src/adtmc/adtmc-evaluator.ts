export type AdtmcAnswer = boolean | number | string;

export interface AdtmcRuleCondition {
  readonly linkId: string;
  readonly operator: 'equals' | 'exists' | 'greater-than' | 'less-than';
  readonly value?: AdtmcAnswer;
}

export interface AdtmcRule {
  readonly id: string;
  readonly conditions: readonly AdtmcRuleCondition[];
  readonly disposition: string;
  readonly guidance: string;
}

export interface AdtmcRuleTable {
  readonly algorithmId: string;
  readonly version: string;
  readonly rules: readonly AdtmcRule[];
}

export interface AdtmcEvaluationResult {
  readonly ruleId: string;
  readonly disposition: string;
  readonly guidance: string;
}

export class AdtmcEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdtmcEvaluationError';
  }
}

export function evaluateAdtmcRuleTable(
  ruleTable: AdtmcRuleTable,
  answers: Readonly<Record<string, AdtmcAnswer | undefined>>
): AdtmcEvaluationResult {
  for (const rule of ruleTable.rules) {
    if (rule.conditions.every((condition) => matchesCondition(condition, answers[condition.linkId]))) {
      return {
        ruleId: rule.id,
        disposition: rule.disposition,
        guidance: rule.guidance,
      };
    }
  }

  throw new AdtmcEvaluationError(
    `No disposition rule matched ${ruleTable.algorithmId} version ${ruleTable.version}`
  );
}

function matchesCondition(condition: AdtmcRuleCondition, answer: AdtmcAnswer | undefined): boolean {
  switch (condition.operator) {
    case 'exists':
      return answer !== undefined;
    case 'equals':
      return answer === condition.value;
    case 'greater-than':
      return typeof answer === 'number' && typeof condition.value === 'number' && answer > condition.value;
    case 'less-than':
      return typeof answer === 'number' && typeof condition.value === 'number' && answer < condition.value;
  }
}