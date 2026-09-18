import { createReference } from '@medplum/core';
import type {
  ClinicalImpression,
  Encounter,
  Patient,
  PlanDefinition,
  Practitioner,
  PractitionerRole,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import type { AdtmcDispositionPolicy } from './adtmc-package';
import type { AdtmcEvaluationResult } from './adtmc-evaluator';

const ALGORITHM_ID_URL = 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-algorithm-id';
const ALGORITHM_VERSION_URL = 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-algorithm-version';
const DECISION_RULE_URL = 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-decision-rule';
const DISPOSITION_URL = 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-disposition';

export interface AdtmcRuntimeContext {
  readonly response: QuestionnaireResponse;
  readonly subject: Reference<Patient> | undefined;
  readonly encounter: Reference<Encounter> | undefined;
  readonly assessor: Reference<Practitioner | PractitionerRole> | undefined;
  readonly algorithm: PlanDefinition;
  readonly algorithmId: string;
  readonly algorithmVersion: string;
  readonly evaluation: AdtmcEvaluationResult;
  readonly dispositionPolicy: AdtmcDispositionPolicy;
}

export interface AdtmcRuntimeResources {
  readonly clinicalImpression: ClinicalImpression;
  readonly task: Task;
}

export function buildAdtmcRuntimeResources(context: AdtmcRuntimeContext): AdtmcRuntimeResources {
  if (!context.subject) {
    throw new Error('A completed ADTMC QuestionnaireResponse requires a patient subject');
  }
  if (!context.encounter) {
    throw new Error('A completed ADTMC QuestionnaireResponse requires an encounter');
  }
  if (!context.response.id) {
    throw new Error('A completed ADTMC QuestionnaireResponse requires an id');
  }

  const now = new Date().toISOString();
  const clinicalImpression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    identifier: [{ system: 'urn:hiivehealth:adtmc-questionnaire-response', value: context.response.id }],
    code: { text: 'ADTMC clinical decision support result' },
    description: context.evaluation.guidance,
    subject: context.subject,
    encounter: context.encounter,
    date: now,
    assessor: context.assessor,
    supportingInfo: [createReference(context.response), createReference(context.algorithm)],
    extension: [
      { url: ALGORITHM_ID_URL, valueString: context.algorithmId },
      { url: ALGORITHM_VERSION_URL, valueString: context.algorithmVersion },
      { url: DECISION_RULE_URL, valueString: context.evaluation.ruleId },
      { url: DISPOSITION_URL, valueCode: context.evaluation.disposition },
    ],
  };

  const task: Task = {
    resourceType: 'Task',
    status: 'ready',
    intent: 'order',
    identifier: [{ system: 'urn:hiivehealth:adtmc-questionnaire-response-task', value: context.response.id }],
    priority: context.dispositionPolicy.taskPriority,
    code: { text: 'ADTMC clinical handoff' },
    description: context.evaluation.guidance,
    focus: createReference(clinicalImpression),
    for: context.subject,
    encounter: context.encounter,
    authoredOn: now,
    requester: context.assessor,
    owner: context.dispositionPolicy.taskOwner,
    extension: [
      { url: ALGORITHM_ID_URL, valueString: context.algorithmId },
      { url: ALGORITHM_VERSION_URL, valueString: context.algorithmVersion },
      { url: DECISION_RULE_URL, valueString: context.evaluation.ruleId },
      { url: DISPOSITION_URL, valueCode: context.evaluation.disposition },
    ],
  };

  return { clinicalImpression, task };
}