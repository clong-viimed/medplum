import type { Task } from '@medplum/fhirtypes';
import type { AdtmcAnswer } from './adtmc-evaluator';

export type AdtmcPackageStatus = 'draft' | 'active' | 'retired';

export interface AdtmcReference {
  readonly reference: string;
}

export interface AdtmcDispositionPolicy {
  readonly code: string;
  readonly taskPriority: 'routine' | 'urgent' | 'asap' | 'stat';
  readonly taskOwner: NonNullable<Task['owner']>;
  readonly requiresServiceRequest: boolean;
}

export interface AdtmcTestFixture {
  readonly name: string;
  readonly answers: Readonly<Record<string, AdtmcAnswer>>;
  readonly expectedDisposition: string;
}

export interface AdtmcAlgorithmPackage {
  readonly algorithmId: string;
  readonly version: string;
  readonly status: AdtmcPackageStatus;
  readonly sourceDocument: AdtmcReference;
  readonly questionnaire: AdtmcReference;
  readonly ruleTable: AdtmcReference;
  readonly dispositionPolicies: readonly AdtmcDispositionPolicy[];
  readonly testFixtures: readonly AdtmcTestFixture[];
}

export interface AdtmcPackageValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateAdtmcAlgorithmPackage(packageDefinition: AdtmcAlgorithmPackage): AdtmcPackageValidationResult {
  const errors: string[] = [];

  if (!packageDefinition.algorithmId) {
    errors.push('algorithmId is required');
  }
  if (!packageDefinition.version) {
    errors.push('version is required');
  }
  if (!packageDefinition.sourceDocument.reference) {
    errors.push('sourceDocument is required');
  }
  if (!packageDefinition.questionnaire.reference) {
    errors.push('questionnaire is required');
  }
  if (!packageDefinition.ruleTable.reference) {
    errors.push('ruleTable is required');
  }
  if (packageDefinition.dispositionPolicies.length === 0) {
    errors.push('at least one disposition policy is required');
  }
  if (packageDefinition.testFixtures.length === 0) {
    errors.push('at least one test fixture is required');
  }

  const dispositionCodes = new Set<string>();
  for (const policy of packageDefinition.dispositionPolicies) {
    if (!policy.code) {
      errors.push('each disposition policy requires a code');
    } else if (dispositionCodes.has(policy.code)) {
      errors.push(`duplicate disposition policy: ${policy.code}`);
    } else {
      dispositionCodes.add(policy.code);
    }
    if (!policy.taskOwner.reference) {
      errors.push(`disposition policy ${policy.code || '<unknown>'} requires a task owner`);
    }
  }

  for (const fixture of packageDefinition.testFixtures) {
    if (!fixture.name) {
      errors.push('each test fixture requires a name');
    }
    if (Object.keys(fixture.answers).length === 0) {
      errors.push(`test fixture ${fixture.name || '<unknown>'} requires answers`);
    }
    if (!fixture.expectedDisposition) {
      errors.push(`test fixture ${fixture.name || '<unknown>'} requires an expected disposition`);
    } else if (!dispositionCodes.has(fixture.expectedDisposition)) {
      errors.push(`test fixture ${fixture.name} references an unknown disposition: ${fixture.expectedDisposition}`);
    }
  }

  return { valid: errors.length === 0, errors };
}