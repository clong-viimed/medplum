import type { PlanDefinition, QuestionnaireResponse } from '@medplum/fhirtypes';
import { expect, test } from 'vitest';
import { buildAdtmcRuntimeResources } from './adtmc-runtime';

const response: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  id: 'response-1',
  status: 'completed',
  subject: { reference: 'Patient/patient-1' },
  encounter: { reference: 'Encounter/encounter-1' },
  author: { reference: 'Practitioner/medic-1' },
};

const subject = { reference: 'Patient/patient-1' };
const encounter = { reference: 'Encounter/encounter-1' };
const assessor = { reference: 'Practitioner/medic-1' };

const algorithm: PlanDefinition = {
  resourceType: 'PlanDefinition',
  id: 'a01',
  status: 'active',
  title: 'A-01 Sore Throat',
};

test('builds traceable FHIR assessment and handoff resources', () => {
  const resources = buildAdtmcRuntimeResources({
    response,
    subject,
    encounter,
    assessor,
    algorithm,
    algorithmId: 'A-01',
    algorithmVersion: '1.0.0',
    evaluation: {
      ruleId: 'red-flag',
      disposition: 'provider-now',
      guidance: 'Escalate immediately.',
    },
    dispositionPolicy: {
      code: 'provider-now',
      taskPriority: 'stat',
      taskOwner: { reference: 'HealthcareService/provider-now-queue' },
      requiresServiceRequest: false,
    },
  });

  expect(resources.clinicalImpression.subject).toEqual(subject);
  expect(resources.clinicalImpression.encounter).toEqual(encounter);
  expect(resources.task.owner).toEqual({ reference: 'HealthcareService/provider-now-queue' });
  expect(resources.task.priority).toBe('stat');
  expect(resources.task.extension).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ valueString: 'A-01' }),
      expect.objectContaining({ valueString: '1.0.0' }),
      expect.objectContaining({ valueCode: 'provider-now' }),
    ])
  );
});

test('rejects responses without a patient or encounter context', () => {
  expect(() =>
    buildAdtmcRuntimeResources({
      response,
      subject: undefined,
      encounter,
      assessor,
      algorithm,
      algorithmId: 'A-01',
      algorithmVersion: '1.0.0',
      evaluation: { ruleId: 'red-flag', disposition: 'provider-now', guidance: 'Escalate immediately.' },
      dispositionPolicy: {
        code: 'provider-now',
        taskPriority: 'stat',
        taskOwner: { reference: 'HealthcareService/provider-now-queue' },
        requiresServiceRequest: false,
      },
    })
  ).toThrow('A completed ADTMC QuestionnaireResponse requires a patient subject');
});