import { expect, test } from 'vitest';
import { validateAdtmcAlgorithmPackage } from './adtmc-package';

test('rejects the incomplete A-01 package until its approved content is supplied', () => {
  const result = validateAdtmcAlgorithmPackage({
    algorithmId: 'A-01',
    version: '1.0.0',
    status: 'draft',
    sourceDocument: { reference: 'DocumentReference/adtmc-definitive-source' },
    questionnaire: { reference: '' },
    ruleTable: { reference: '' },
    dispositionPolicies: [],
    testFixtures: [],
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toEqual(
    expect.arrayContaining([
      'questionnaire is required',
      'ruleTable is required',
      'at least one disposition policy is required',
      'at least one test fixture is required',
    ])
  );
});

test('accepts a complete source-faithful package', () => {
  const result = validateAdtmcAlgorithmPackage({
    algorithmId: 'A-01',
    version: '1.0.0',
    status: 'draft',
    sourceDocument: { reference: 'DocumentReference/adtmc-definitive-source' },
    questionnaire: { reference: 'Questionnaire/a01-sore-throat' },
    ruleTable: { reference: 'DocumentReference/a01-sore-throat-rules' },
    dispositionPolicies: [
      {
        code: 'provider-now',
        taskPriority: 'stat',
        taskOwner: { reference: 'HealthcareService/provider-now-queue' },
        requiresServiceRequest: false,
      },
    ],
    testFixtures: [
      { name: 'red-flag route', answers: { 'symptoms-more-than-10-days': true }, expectedDisposition: 'provider-now' },
    ],
  });

  expect(result).toEqual({ valid: true, errors: [] });
});

test('rejects fixtures that do not map to a configured disposition', () => {
  const result = validateAdtmcAlgorithmPackage({
    algorithmId: 'A-01',
    version: '1.0.0',
    status: 'draft',
    sourceDocument: { reference: 'DocumentReference/adtmc-definitive-source' },
    questionnaire: { reference: 'Questionnaire/a01-sore-throat' },
    ruleTable: { reference: 'DocumentReference/a01-sore-throat-rules' },
    dispositionPolicies: [
      {
        code: 'provider-now',
        taskPriority: 'stat',
        taskOwner: { reference: 'HealthcareService/provider-now-queue' },
        requiresServiceRequest: false,
      },
    ],
    testFixtures: [
      {
        name: 'invalid route',
        answers: { 'symptoms-more-than-10-days': true },
        expectedDisposition: 'minor-care-protocols',
      },
    ],
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toContain('test fixture invalid route references an unknown disposition: minor-care-protocols');
});