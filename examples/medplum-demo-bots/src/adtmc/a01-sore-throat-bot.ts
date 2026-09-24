import { createReference, getQuestionnaireAnswers, type WithId } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  CareTeam,
  ClinicalImpression,
  Encounter,
  Patient,
  Practitioner,
  PractitionerRole,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { a01SoreThroatPackage, a01SoreThroatRuleTable } from './a01-sore-throat';
import { evaluateAdtmcRuleTable, type AdtmcAnswer } from './adtmc-evaluator';
import { buildAdtmcRuntimeResources } from './adtmc-runtime';

const RESPONSE_IDENTIFIER_SYSTEM = 'urn:hiivehealth:adtmc-questionnaire-response';
const TASK_IDENTIFIER_SYSTEM = 'urn:hiivehealth:adtmc-questionnaire-response-task';
const A01_PLAN_DEFINITION_URL = 'https://ehr.hiivehealth.net/fhir/PlanDefinition/a01-sore-throat';
const ROUTING_QUEUE_IDENTIFIER_SYSTEM = 'urn:hiivehealth:adtmc-routing-queue';
const CARE_TEAM_IDENTIFIER_SYSTEM = 'urn:hiivehealth:adtmc-care-team';
const CARE_TEAM_EXTENSION_URL = 'https://ehr.hiivehealth.net/fhir/StructureDefinition/adtmc-care-team';
const PROVIDER_NOW_TASK_CODE = 'Provider Now: ADTMC A-01 Sore Throat/Hoarseness';
const PROVIDER_NOW_TASK_DESCRIPTION =
  'The ADTMC A-01 Sore Throat/Hoarseness algorithm triggered a Provider Now screening disposition. Review and continue clinical documentation in the linked encounter.';

export interface AdtmcBotResult {
  readonly clinicalImpression: ClinicalImpression;
  readonly task: Task;
  readonly created: boolean;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<QuestionnaireResponse>
): Promise<AdtmcBotResult | null> {
  const response = event.input;
  if (response.status !== 'completed') {
    return null;
  }
  if (!response.id) {
    throw new Error('A completed ADTMC QuestionnaireResponse requires an id');
  }
  if (!isA01SoreThroatResponse(response)) {
    return null;
  }

  const existing = await medplum.searchOne('ClinicalImpression', {
    identifier: `${RESPONSE_IDENTIFIER_SYSTEM}|${response.id}`,
  });
  if (existing) {
    const task = await medplum.searchOne('Task', {
      identifier: `${TASK_IDENTIFIER_SYSTEM}|${response.id}`,
    });
    if (!task) {
      throw new Error(`ADTMC result for QuestionnaireResponse/${response.id} is missing its handoff Task`);
    }
    return { clinicalImpression: existing, task, created: false };
  }

  const subject = asReference<Patient>(response.subject, 'Patient');
  const encounter = asReference<Encounter>(response.encounter, 'Encounter');
  const assessor = asPractitionerReference(response.author);
  const answers = getA01Answers(response);
  const evaluation = evaluateAdtmcRuleTable(a01SoreThroatRuleTable, answers);
  const dispositionPolicy = a01SoreThroatPackage.dispositionPolicies.find(
    (policy) => policy.code === evaluation.disposition
  );
  if (!dispositionPolicy) {
    throw new Error(`A-01 does not define routing for disposition ${evaluation.disposition}`);
  }
  const [algorithm, taskOwner] = await Promise.all([
    medplum.searchOne<'PlanDefinition'>('PlanDefinition', {
      url: A01_PLAN_DEFINITION_URL,
      version: a01SoreThroatPackage.version,
    }),
    getTaskOwner(medplum, subject, evaluation.disposition),
  ]);
  if (!algorithm?.id) {
    throw new Error('The A-01 Sore Throat PlanDefinition is not published for this project');
  }
  if (!taskOwner?.id) {
    throw new Error(`The A-01 routing queue for ${evaluation.disposition} is not published for this project`);
  }

  const resources = buildAdtmcRuntimeResources({
    response,
    subject,
    encounter,
    assessor,
    algorithm,
    algorithmId: a01SoreThroatPackage.algorithmId,
    algorithmVersion: a01SoreThroatPackage.version,
    evaluation,
    dispositionPolicy: { ...dispositionPolicy, taskOwner: createReference(taskOwner) },
  });
  const clinicalImpression = await medplum.createResource(resources.clinicalImpression);
  const task = await medplum.createResource({
    ...resources.task,
    ...(evaluation.disposition === 'provider-now'
      ? { code: { text: PROVIDER_NOW_TASK_CODE }, description: PROVIDER_NOW_TASK_DESCRIPTION }
      : {}),
    focus: createReference(clinicalImpression),
  });
  return { clinicalImpression, task, created: true };
}

async function getTaskOwner(
  medplum: MedplumClient,
  subject: Reference<Patient>,
  disposition: string
): Promise<WithId<{ resourceType: 'HealthcareService'; name?: string }> | undefined> {
  const patient = await medplum.readReference<Patient>(subject);
  const careTeamReference = patient.extension?.find((extension) => extension.url === CARE_TEAM_EXTENSION_URL)?.valueReference;
  if (careTeamReference?.reference?.startsWith('CareTeam/')) {
    const careTeam = await medplum.readReference<CareTeam>(careTeamReference as Reference<CareTeam>);
    const teamIdentifier = careTeam.identifier?.find((identifier) => identifier.system === CARE_TEAM_IDENTIFIER_SYSTEM)?.value;
    if (teamIdentifier) {
      const teamQueue = await medplum.searchOne<'HealthcareService'>('HealthcareService', {
        identifier: `${ROUTING_QUEUE_IDENTIFIER_SYSTEM}|${teamIdentifier}-${disposition}`,
      });
      if (teamQueue?.id) {
        return teamQueue;
      }
    }
  }

  return medplum.searchOne<'HealthcareService'>('HealthcareService', {
    identifier: `${ROUTING_QUEUE_IDENTIFIER_SYSTEM}|${disposition}`,
  });
}

export function getA01Answers(response: QuestionnaireResponse): Readonly<Record<string, AdtmcAnswer>> {
  const questionnaireAnswers = getQuestionnaireAnswers(response);
  const answers: Record<string, AdtmcAnswer> = {};
  for (const [linkId, answer] of Object.entries(questionnaireAnswers)) {
    const rawValue = answer.valueBoolean ?? answer.valueInteger ?? answer.valueDecimal ?? answer.valueString ?? answer.valueCoding?.code;
    const value = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
    if (value !== undefined) {
      answers[linkId] = value;
    }
  }

  answers['strep-criteria-count'] = Number(answers['dp2-fever'] === true) + Number(answers['no-cough'] === true) + Number(answers['tonsillar-exudate'] === true) + Number(answers['swollen-anterior-cervical-nodes'] === true);
  return answers;
}

function isA01SoreThroatResponse(response: QuestionnaireResponse): boolean {
  return response.questionnaire === `${a01SoreThroatPackage.questionnaire.reference.replace('Questionnaire/', 'https://ehr.hiivehealth.net/fhir/Questionnaire/')}|${a01SoreThroatPackage.version}`;
}

function asReference<T extends Patient | Encounter>(reference: Reference | undefined, resourceType: T['resourceType']): Reference<T> {
  if (reference?.reference?.startsWith(`${resourceType}/`)) {
    return reference as Reference<T>;
  }
  throw new Error(`A completed ADTMC QuestionnaireResponse requires a ${resourceType} ${resourceType === 'Patient' ? 'subject' : 'encounter'}`);
}

function asPractitionerReference(reference: Reference | undefined): Reference<Practitioner | PractitionerRole> | undefined {
  if (reference?.reference?.startsWith('Practitioner/') || reference?.reference?.startsWith('PractitionerRole/')) {
    return reference as Reference<Practitioner | PractitionerRole>;
  }
  return undefined;
}