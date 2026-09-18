import type { CareTeam, ClinicalImpression, HealthcareService, Patient, PlanDefinition, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { ReadablePromise, type WithId } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { a01SoreThroatPlanDefinition } from './a01-sore-throat';
import { getA01Answers, handler } from './a01-sore-throat-bot';

function buildResponse(overrides: Partial<QuestionnaireResponse> = {}): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    id: 'a01-response-1',
    status: 'completed',
    questionnaire: 'https://ehr.hiivehealth.net/fhir/Questionnaire/a01-sore-throat|1.0.0',
    subject: { reference: 'Patient/patient-1' },
    encounter: { reference: 'Encounter/encounter-1' },
    author: { reference: 'Practitioner/medic-1' },
    item: [
      { linkId: 'symptoms-more-than-10-days', answer: [{ valueBoolean: false }] },
      { linkId: 'immunosuppression', answer: [{ valueBoolean: false }] },
      { linkId: 'inhaled-steroid', answer: [{ valueBoolean: false }] },
      { linkId: 'fever', answer: [{ valueBoolean: false }] },
      { linkId: 'dp2-fever', answer: [{ valueBoolean: true }] },
      { linkId: 'no-cough', answer: [{ valueBoolean: true }] },
      { linkId: 'tonsillar-exudate', answer: [{ valueBoolean: true }] },
      { linkId: 'swollen-anterior-cervical-nodes', answer: [{ valueBoolean: true }] },
      { linkId: 'rapid-strep-culture-result', answer: [{ valueCoding: { code: 'positive' } }] },
    ],
    ...overrides,
  };
}

function mockA01Configuration(medplum: MockClient): void {
  const planDefinition: PlanDefinition & { id: string } = { ...a01SoreThroatPlanDefinition, id: 'published-a01-plan' };
  const queue: HealthcareService & { id: string } = {
    resourceType: 'HealthcareService',
    id: 'aem-queue',
    active: true,
    name: 'AEM Now Queue',
  };
  vi.spyOn(medplum, 'searchOne').mockImplementation((resourceType) => {
    if (resourceType === 'PlanDefinition') {
      return new ReadablePromise(Promise.resolve(planDefinition)) as never;
    }
    if (resourceType === 'HealthcareService') {
      return new ReadablePromise(Promise.resolve(queue)) as never;
    }
    return new ReadablePromise(Promise.resolve(undefined)) as never;
  });
}

test('derives the four-point strep criterion count from the completed response', () => {
  expect(getA01Answers(buildResponse())['strep-criteria-count']).toBe(4);
});

test('creates one AEM handoff for a completed A-01 response', async () => {
  const medplum = new MockClient();
  mockA01Configuration(medplum);
  vi.spyOn(medplum, 'readReference').mockReturnValue(new ReadablePromise(Promise.resolve({ resourceType: 'Patient', id: 'patient-1' } as WithId<Patient>)) as never);
  const response = buildResponse();
  const result = await handler(medplum, { bot: { reference: 'Bot/a01' }, input: response, contentType: 'application/fhir+json', secrets: {} });

  expect(result?.created).toBe(true);
  expect(result?.clinicalImpression.extension).toEqual(expect.arrayContaining([expect.objectContaining({ valueCode: 'aem-now' })]));
  expect(result?.task.owner).toEqual(
    expect.objectContaining({ reference: 'HealthcareService/aem-queue', display: 'AEM Now Queue' })
  );
});

test('labels every Provider Now handoff for immediate review', async () => {
  const medplum = new MockClient();
  mockA01Configuration(medplum);
  vi.spyOn(medplum, 'readReference').mockReturnValue(
    new ReadablePromise(Promise.resolve({ resourceType: 'Patient', id: 'patient-1' } as WithId<Patient>)) as never
  );

  const result = await handler(medplum, {
    bot: { reference: 'Bot/a01' },
    input: buildResponse({ item: [{ linkId: 'shortness-of-breath', answer: [{ valueBoolean: true }] }] }),
    contentType: 'application/fhir+json',
    secrets: {},
  });

  expect(result?.task.code?.text).toBe('Provider Now: ADTMC A-01 Sore Throat/Hoarseness');
  expect(result?.task.description).toContain('Provider Now screening disposition');
});

test('uses the Provider Now handoff code for a DP1 escalation', async () => {
  const medplum = new MockClient();
  mockA01Configuration(medplum);
  vi.spyOn(medplum, 'readReference').mockReturnValue(
    new ReadablePromise(Promise.resolve({ resourceType: 'Patient', id: 'patient-1' } as WithId<Patient>)) as never
  );

  const result = await handler(medplum, {
    bot: { reference: 'Bot/a01' },
    input: buildResponse({ item: [{ linkId: 'fever', answer: [{ valueBoolean: true }] }] }),
    contentType: 'application/fhir+json',
    secrets: {},
  });

  expect(result?.task.code?.text).toBe('Provider Now: ADTMC A-01 Sore Throat/Hoarseness');
});

test('routes to the patient care team queue when it is configured for the disposition', async () => {
  const medplum = new MockClient();
  const planDefinition: PlanDefinition & { id: string } = { ...a01SoreThroatPlanDefinition, id: 'published-a01-plan' };
  const team: CareTeam & { id: string } = {
    resourceType: 'CareTeam',
    id: 'alpha-team',
    status: 'active',
    identifier: [{ system: 'urn:hiivehealth:adtmc-care-team', value: 'alpha-hall' }],
  };
  const patient: WithId<Patient> = {
    resourceType: 'Patient',
    id: 'patient-1',
    extension: [{ url: 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-care-team', valueReference: { reference: 'CareTeam/alpha-team' } }],
  };
  const queue: HealthcareService & { id: string } = {
    resourceType: 'HealthcareService',
    id: 'alpha-aem-queue',
    active: true,
    name: 'Alpha Hall AEM Work Queue',
  };
  vi.spyOn(medplum, 'readReference').mockImplementation((reference) =>
    new ReadablePromise(Promise.resolve(reference.reference === 'Patient/patient-1' ? patient : team)) as never
  );
  vi.spyOn(medplum, 'searchOne').mockImplementation((resourceType, query) => {
    if (resourceType === 'ClinicalImpression') return new ReadablePromise(Promise.resolve(undefined)) as never;
    if (resourceType === 'PlanDefinition') return new ReadablePromise(Promise.resolve(planDefinition)) as never;
    if (resourceType === 'HealthcareService' && (query as Record<string, string>)?.identifier === 'urn:hiivehealth:adtmc-routing-queue|alpha-hall-aem-now') {
      return new ReadablePromise(Promise.resolve(queue)) as never;
    }
    return new ReadablePromise(Promise.resolve(undefined)) as never;
  });

  const result = await handler(medplum, { bot: { reference: 'Bot/a01' }, input: buildResponse(), contentType: 'application/fhir+json', secrets: {} });

  expect(result?.task.owner).toEqual(expect.objectContaining({ reference: 'HealthcareService/alpha-aem-queue' }));
});

test('does not create duplicate resources when a completed response event is retried', async () => {
  const medplum = new MockClient();
  const response = buildResponse();
  vi.spyOn(medplum, 'readReference').mockReturnValue(new ReadablePromise(Promise.resolve({ resourceType: 'Patient', id: 'patient-1' } as WithId<Patient>)) as never);
  const event = { bot: { reference: 'Bot/a01' }, input: response, contentType: 'application/fhir+json', secrets: {} };
  const existingClinicalImpression: ClinicalImpression & { id: string } = {
    resourceType: 'ClinicalImpression',
    id: 'existing-impression',
    status: 'completed',
    subject: { reference: 'Patient/patient-1' },
  };
  const existingTask: Task & { id: string } = {
    resourceType: 'Task',
    id: 'existing-task',
    status: 'ready',
    intent: 'order',
  };
  const planDefinition: PlanDefinition & { id: string } = { ...a01SoreThroatPlanDefinition, id: 'published-a01-plan' };
  const queue: HealthcareService & { id: string } = {
    resourceType: 'HealthcareService',
    id: 'aem-queue',
    active: true,
    name: 'AEM Now Queue',
  };
  let clinicalImpressionSearches = 0;
  const searchOneSpy = vi.spyOn(medplum, 'searchOne').mockImplementation((resourceType) => {
    if (resourceType === 'ClinicalImpression') {
      clinicalImpressionSearches += 1;
      return new ReadablePromise(Promise.resolve(clinicalImpressionSearches === 1 ? undefined : existingClinicalImpression)) as never;
    }
    if (resourceType === 'PlanDefinition') {
      return new ReadablePromise(Promise.resolve(planDefinition)) as never;
    }
    if (resourceType === 'HealthcareService') {
      return new ReadablePromise(Promise.resolve(queue)) as never;
    }
    if (resourceType === 'Task') {
      return new ReadablePromise(Promise.resolve(existingTask)) as never;
    }
    return new ReadablePromise(Promise.resolve(undefined)) as never;
  });
  const createResourceSpy = vi.spyOn(medplum, 'createResource');

  await handler(medplum, event);
  const retryResult = await handler(medplum, event);

  expect(retryResult?.created).toBe(false);
  expect(retryResult?.clinicalImpression).toBe(existingClinicalImpression);
  expect(retryResult?.task).toBe(existingTask);
  expect(createResourceSpy).toHaveBeenCalledTimes(2);
  expect(searchOneSpy).toHaveBeenCalledTimes(5);
});

test('does not evaluate a response for a different questionnaire', async () => {
  const medplum = new MockClient();
  const response = buildResponse({ questionnaire: 'https://ehr.hiivehealth.net/fhir/Questionnaire/other|1.0.0' });
  await expect(handler(medplum, { bot: { reference: 'Bot/a01' }, input: response, contentType: 'application/fhir+json', secrets: {} })).resolves.toBeNull();
});