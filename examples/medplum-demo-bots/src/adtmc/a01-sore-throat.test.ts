import { expect, test } from 'vitest';
import { evaluateAdtmcRuleTable } from './adtmc-evaluator';
import {
  a01SoreThroatPackage,
  a01SoreThroatPlanDefinition,
  a01SoreThroatQuestionnaire,
  a01SoreThroatRuleTable,
} from './a01-sore-throat';
import { validateAdtmcAlgorithmPackage } from './adtmc-package';

test('publishes a complete A-01 package linked to the approved source page', () => {
  expect(validateAdtmcAlgorithmPackage(a01SoreThroatPackage)).toEqual({ valid: true, errors: [] });
  expect(a01SoreThroatQuestionnaire.title).toBe('Sore Throat/Hoarseness, A-1');
  expect(a01SoreThroatPackage.sourceDocument.reference).toBe('DocumentReference/adtmc-medcom-pam-40-7-21-page-20');
  expect(a01SoreThroatPlanDefinition.identifier).toContainEqual({ system: 'urn:hiivehealth:adtmc-algorithm', value: 'A-01' });
  expect(a01SoreThroatQuestionnaire.item?.flatMap((item) => item.item ?? []).map((item) => item.linkId)).not.toContain(
    'strep-criteria-count'
  );
  expect(a01SoreThroatQuestionnaire.item?.[0].item?.map((item) => item.linkId)).toEqual([
    'shortness-of-breath',
    'stridor',
    'deviated-uvula',
    'drooling-trouble-swallowing',
    'stiff-neck',
    'red-flags-guidance',
  ]);
  expect(a01SoreThroatQuestionnaire.item?.[1].linkId).toBe('dp1-screen');
});

test.each(a01SoreThroatPackage.testFixtures)('$name', ({ answers, expectedDisposition }) => {
  expect(evaluateAdtmcRuleTable(a01SoreThroatRuleTable, answers).disposition).toBe(expectedDisposition);
});

test('does not route a positive test without the required three strep criteria', () => {
  expect(() =>
    evaluateAdtmcRuleTable(a01SoreThroatRuleTable, {
      'symptoms-more-than-10-days': false,
      immunosuppression: false,
      'inhaled-steroid': false,
      fever: false,
      'strep-criteria-count': 2,
      'rapid-strep-culture-result': 'positive',
    })
  ).toThrow('No disposition rule matched A-01 version 1.0.0');
});