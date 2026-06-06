// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const { getReferenceString } = require('@medplum/core');

const BOT_NAME = 'Occupational Incident Intake Processor';
const DEMO_PROVIDER_REFERENCE = 'Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3';
const QUESTIONNAIRE_NAME = 'OccupationalIncidentIntakeQuestionnaire';
const CODE_SYSTEM = 'https://hiivecare.example/fhir/CodeSystem/medplum-ubix-demo';
const CASE_IDENTIFIER_SYSTEM = 'https://hiivecare.example/fhir/NamingSystem/occupational-incident-case-key';
const QUESTIONNAIRE_RESPONSE_IDENTIFIER_SYSTEM =
  'https://hiivecare.example/fhir/NamingSystem/occupational-incident-questionnaire-response';

const CHOICE_SPECS = {
  incidentType: {
    label: 'incident type',
    values: {
      'work-related-injury': 'Work-related injury',
      'occupational-illness': 'Occupational illness',
      'exposure-incident': 'Exposure incident',
      'near-miss': 'Near miss',
      'critical-incident': 'Critical incident',
    },
  },
  component: {
    label: 'work unit / agency component',
    values: {
      'component-a': 'Office of Health Security',
      'component-b': 'Field Operations',
      'component-c': 'Mission Support',
    },
  },
  dutyLocation: {
    label: 'duty location',
    values: {
      headquarters: 'Headquarters',
      'field-office': 'Field office',
      'processing-center': 'Processing center',
    },
  },
  jobRole: {
    label: 'job role',
    values: {
      'field-response': 'Field response',
      'clinical-staff': 'Clinical staff',
      'program-analyst': 'Program analyst',
    },
  },
  returnToWorkStatus: {
    label: 'return-to-work status',
    values: {
      'full-duty': 'Full duty',
      'restricted-duty': 'Restricted duty',
      'not-fit': 'Not fit',
      'pending-reevaluation': 'Pending reevaluation',
    },
  },
  restrictionType: {
    label: 'restriction type',
    values: {
      'no-restrictions': 'No restrictions',
      'field-duty-restricted': 'Field duty restricted',
      'limited-lifting': 'Limited lifting',
      'ppe-required': 'PPE required',
      'not-cleared': 'Not cleared',
    },
  },
};

async function handler(medplum, event) {
  const questionnaireResponse = event?.input;
  if (!questionnaireResponse || questionnaireResponse.resourceType !== 'QuestionnaireResponse') {
    throw new Error(`${BOT_NAME} expected a QuestionnaireResponse input.`);
  }

  const dryRun = isTruthy(event?.headers?.['x-medplum-dry-run']) || isTruthy(event?.headers?.['x-demo-dry-run']);
  const workflow = await runIncidentIntakeWorkflow(medplum, questionnaireResponse, { dryRun, traceId: event?.traceId });
  console.log(JSON.stringify(workflow.log));
  return workflow.result;
}

async function runIncidentIntakeWorkflow(medplum, questionnaireResponse, options) {
  const payload = parseQuestionnaireResponse(questionnaireResponse);
  const caseKey = buildCaseKey(payload);
  const questionnaireResponseReference = getReferenceString(questionnaireResponse);
  const caseIdentifier = identifier(CASE_IDENTIFIER_SYSTEM, caseKey);

  const plan = {
    bot: BOT_NAME,
    mode: options.dryRun ? 'dry-run' : 'apply',
    questionnaireResponse: questionnaireResponseReference,
    questionnaireResponseId: questionnaireResponse.id || null,
    questionnaire: normalizeReferenceValue(questionnaireResponse.questionnaire),
    patient: payload.patientReference,
    caseKey,
    incidentType: payload.incidentType.code,
    component: payload.component.code,
    dutyLocation: payload.dutyLocation.code,
    returnToWorkStatus: payload.returnToWorkStatus.code,
    restrictionType: payload.restrictionType.code,
  };

  if (options.dryRun) {
    return {
      log: { ...plan, status: 'planned' },
      result: {
        status: 'dry-run',
        plan,
      },
    };
  }

  const episode = await upsertEpisodeOfCare(medplum, payload, caseIdentifier, questionnaireResponseReference);
  const encounter = await upsertEncounter(medplum, payload, caseIdentifier, episode, questionnaireResponseReference);
  const serviceRequest = await upsertServiceRequest(
    medplum,
    payload,
    caseIdentifier,
    episode,
    encounter,
    questionnaireResponseReference
  );
  const observation = await upsertObservation(
    medplum,
    payload,
    caseIdentifier,
    episode,
    questionnaireResponseReference
  );
  const task = await upsertTask(medplum, payload, caseIdentifier, episode, encounter, questionnaireResponseReference);

  return {
    log: {
      ...plan,
      status: 'applied',
      episode: getReferenceString(episode),
      encounter: getReferenceString(encounter),
      serviceRequest: getReferenceString(serviceRequest),
      observation: getReferenceString(observation),
      task: getReferenceString(task),
    },
    result: {
      status: 'applied',
      caseKey,
      episode: getReferenceString(episode),
      encounter: getReferenceString(encounter),
      serviceRequest: getReferenceString(serviceRequest),
      observation: getReferenceString(observation),
      task: getReferenceString(task),
    },
  };
}

function parseQuestionnaireResponse(questionnaireResponse) {
  const questionnaireReference = normalizeReferenceValue(questionnaireResponse.questionnaire);
  if (!questionnaireReference) {
    throw new Error(`${BOT_NAME} expected ${QUESTIONNAIRE_NAME} submissions.`);
  }

  const itemMap = new Map(flattenItems(questionnaireResponse.item || []).map((item) => [item.linkId, item]));
  const patientReference = normalizeReferenceValue(questionnaireResponse.subject);
  if (!patientReference) {
    throw new Error('QuestionnaireResponse is missing a subject reference.');
  }

  const incidentType = readChoiceAnswer(itemMap, 'incidentType');
  const component = readChoiceAnswer(itemMap, 'component');
  const dutyLocation = readChoiceAnswer(itemMap, 'dutyLocation');
  const jobRole = readChoiceAnswer(itemMap, 'jobRole', { optional: true });
  const incidentDateTime = readDateTimeAnswer(itemMap, 'incidentDateTime');
  const incidentDescription = readTextAnswer(itemMap, 'incidentDescription', { optional: true });
  const returnToWorkStatus = readChoiceAnswer(itemMap, 'returnToWorkStatus', {
    optional: true,
    fallbackCode: 'pending-reevaluation',
  });
  const restrictionType = readChoiceAnswer(itemMap, 'restrictionType', {
    optional: true,
    fallbackCode: 'field-duty-restricted',
  });
  const restrictionSummary = readTextAnswer(itemMap, 'restrictionSummary', { optional: true });
  const restrictionLimit = readTextAnswer(itemMap, 'restrictionLimit', { optional: true });
  const restrictionEffectiveDate = readDateAnswer(itemMap, 'restrictionEffectiveDate', { optional: true });
  const restrictionExpirationDate = readDateAnswer(itemMap, 'restrictionExpirationDate', { optional: true });
  const restrictionReevaluationDate = readDateAnswer(itemMap, 'restrictionReevaluationDate', { optional: true });

  return {
    questionnaireReference,
    patientReference,
    incidentType,
    component,
    dutyLocation,
    jobRole,
    incidentDateTime,
    incidentDescription,
    returnToWorkStatus,
    restrictionType,
    restrictionSummary,
    restrictionLimit,
    restrictionEffectiveDate,
    restrictionExpirationDate,
    restrictionReevaluationDate,
  };
}

async function upsertEpisodeOfCare(medplum, payload, caseIdentifier, questionnaireResponseReference) {
  return upsertByIdentifier(medplum, 'EpisodeOfCare', caseIdentifier, async (current) => {
    const episode = current ? { ...current } : { resourceType: 'EpisodeOfCare' };
    episode.status = 'active';
    episode.identifier = [caseIdentifier];
    episode.patient = { reference: payload.patientReference };
    episode.period = { ...(episode.period || {}), start: payload.incidentDateTime };
    episode.reasonCode = [codeableConcept(payload.incidentType.code, payload.incidentType.display)];
    episode.type = [codeableConcept(payload.incidentType.code, payload.incidentType.display)];
    episode.diagnosis = episode.diagnosis || [];
    episode.note = undefined;
    episode.extension = mergeExtensions(episode.extension, questionnaireReferenceExtension(questionnaireResponseReference));
    return episode;
  });
}

async function upsertEncounter(medplum, payload, caseIdentifier, episode, questionnaireResponseReference) {
  return upsertByIdentifier(medplum, 'Encounter', caseIdentifier, async (current) => {
    const encounter = current ? { ...current } : { resourceType: 'Encounter' };
    encounter.status = 'finished';
    encounter.class = { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' };
    encounter.identifier = [caseIdentifier];
    encounter.subject = { reference: payload.patientReference };
    encounter.episodeOfCare = [{ reference: getReferenceString(episode) }];
    encounter.period = { ...(encounter.period || {}), start: payload.incidentDateTime, end: payload.incidentDateTime };
    encounter.reasonCode = [codeableConcept(payload.incidentType.code, payload.incidentType.display)];
    encounter.reasonReference = [{ reference: questionnaireResponseReference }];
    return encounter;
  });
}

async function upsertServiceRequest(medplum, payload, caseIdentifier, episode, encounter, questionnaireResponseReference) {
  return upsertByIdentifier(medplum, 'ServiceRequest', caseIdentifier, async (current) => {
    const serviceRequest = current ? { ...current } : { resourceType: 'ServiceRequest' };
    serviceRequest.status = 'active';
    serviceRequest.intent = 'order';
    serviceRequest.identifier = [caseIdentifier];
    serviceRequest.subject = { reference: payload.patientReference };
    serviceRequest.encounter = { reference: getReferenceString(encounter) };
    serviceRequest.reasonReference = [{ reference: getReferenceString(episode) }];
    serviceRequest.code = codeableConcept('occupational-follow-up', 'Occupational follow-up');
    serviceRequest.basedOn = [{ reference: questionnaireResponseReference }];
    serviceRequest.authoredOn = payload.incidentDateTime;
    return serviceRequest;
  });
}

async function upsertObservation(medplum, payload, caseIdentifier, episode, questionnaireResponseReference) {
  return upsertByIdentifier(medplum, 'Observation', caseIdentifier, async (current) => {
    const observation = current ? { ...current } : { resourceType: 'Observation' };
    observation.status = 'final';
    observation.identifier = [caseIdentifier];
    observation.code = codeableConcept('return-to-work-status', 'Return-to-work status');
    observation.subject = { reference: payload.patientReference };
    observation.focus = [{ reference: getReferenceString(episode) }];
    observation.derivedFrom = [{ reference: questionnaireResponseReference }];
    observation.effectiveDateTime = payload.incidentDateTime;
    observation.valueCodeableConcept = codeableConcept(payload.returnToWorkStatus.code, payload.returnToWorkStatus.display);
    observation.component = buildObservationComponents(payload);
    observation.note = undefined;
    return observation;
  });
}

async function upsertTask(medplum, payload, caseIdentifier, episode, encounter, questionnaireResponseReference) {
  return upsertByIdentifier(medplum, 'Task', caseIdentifier, async (current) => {
    const task = current ? { ...current } : { resourceType: 'Task' };
    task.status = 'requested';
    task.intent = 'order';
    task.identifier = [caseIdentifier];
    task.code = codeableConcept('rtw-follow-up', 'RTW case follow-up');
    task.for = { reference: payload.patientReference };
    task.focus = { reference: getReferenceString(episode) };
    task.encounter = { reference: getReferenceString(encounter) };
    task.basedOn = [{ reference: questionnaireResponseReference }];
    task.authoredOn = payload.incidentDateTime;
    task.owner = { reference: DEMO_PROVIDER_REFERENCE };
    task.note = undefined;
    return task;
  });
}

async function upsertByIdentifier(medplum, resourceType, caseIdentifier, buildDesired) {
  const existing = await medplum.searchOne(resourceType, {
    identifier: `${caseIdentifier.system}|${caseIdentifier.value}`,
  });
  const desired = await buildDesired(existing || undefined);

  if (!existing) {
    return medplum.createResource(desired);
  }

  return medplum.updateResource({ ...desired, id: existing.id });
}

function buildObservationComponents(payload) {
  const components = [];

  if (payload.restrictionType) {
    components.push(
      component('restriction-type', 'Restriction type', {
        valueCodeableConcept: codeableConcept(payload.restrictionType.code, payload.restrictionType.display),
      })
    );
  }
  if (payload.restrictionSummary) {
    components.push(component('restriction-summary', 'Restriction summary', { valueString: payload.restrictionSummary }));
  }
  if (payload.restrictionLimit) {
    components.push(component('restriction-limit', 'Restriction limit', { valueString: payload.restrictionLimit }));
  }
  if (payload.restrictionEffectiveDate) {
    components.push(
      component('restriction-effective-date', 'Restriction effective date', {
        valueDateTime: payload.restrictionEffectiveDate,
      })
    );
  }
  if (payload.restrictionExpirationDate) {
    components.push(
      component('restriction-expiration-date', 'Restriction expiration date', {
        valueDateTime: payload.restrictionExpirationDate,
      })
    );
  }
  if (payload.restrictionReevaluationDate) {
    components.push(
      component('restriction-reevaluation-date', 'Restriction reevaluation date', {
        valueDateTime: payload.restrictionReevaluationDate,
      })
    );
  }

  return components;
}

function readChoiceAnswer(itemMap, linkId, options = {}) {
  const item = itemMap.get(linkId);
  const spec = CHOICE_SPECS[linkId];
  const answer = firstAnswer(item);
  if (!answer) {
    if (options.optional) {
      if (options.fallbackCode) {
        return { code: options.fallbackCode, display: spec.values[options.fallbackCode] || options.fallbackCode };
      }
      return undefined;
    }
    throw new Error(`QuestionnaireResponse is missing ${spec.label}.`);
  }

  const normalized = normalizeChoiceValue(answer, spec.values);
  if (normalized) {
    return normalized;
  }

  throw new Error(`QuestionnaireResponse has an invalid ${spec.label}.`);
}

function readTextAnswer(itemMap, linkId, options = {}) {
  const answer = firstAnswer(itemMap.get(linkId));
  if (!answer) {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`QuestionnaireResponse is missing ${linkId}.`);
  }
  const value = extractAnswerValue(answer);
  if (value == null || value === '') {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`QuestionnaireResponse is missing ${linkId}.`);
  }
  return String(value);
}

function readDateAnswer(itemMap, linkId, options = {}) {
  const answer = firstAnswer(itemMap.get(linkId));
  if (!answer) {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`QuestionnaireResponse is missing ${linkId}.`);
  }
  const value = extractAnswerValue(answer);
  if (value == null || value === '') {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`QuestionnaireResponse is missing ${linkId}.`);
  }
  return String(value);
}

function readDateTimeAnswer(itemMap, linkId) {
  const answer = firstAnswer(itemMap.get(linkId));
  if (!answer) {
    throw new Error(`QuestionnaireResponse is missing incident date/time.`);
  }
  const value = extractAnswerValue(answer);
  if (!value) {
    throw new Error(`QuestionnaireResponse is missing incident date/time.`);
  }
  const timestamp = new Date(String(value));
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('QuestionnaireResponse incident date/time is invalid.');
  }
  return timestamp.toISOString();
}

function normalizeChoiceValue(answer, values) {
  const candidates = [
    answer?.valueCoding?.code,
    answer?.valueCoding?.display,
    answer?.valueString,
    answer?.valueUri,
    answer?.valueId,
    answer?.valueMarkdown,
    answer?.text,
  ]
    .filter(Boolean)
    .map((value) => normalizeToken(value));

  for (const [code, display] of Object.entries(values)) {
    const normalizedCode = normalizeToken(code);
    const normalizedDisplay = normalizeToken(display);
    if (candidates.includes(normalizedCode) || candidates.includes(normalizedDisplay)) {
      return { code, display };
    }
  }

  return undefined;
}

function buildCaseKey(payload) {
  return [
    normalizeToken(payload.patientReference),
    payload.incidentDateTime,
    payload.incidentType.code,
    payload.component.code,
    payload.dutyLocation.code,
  ].join('|');
}

function flattenItems(items) {
  const flattened = [];
  for (const item of items || []) {
    flattened.push(item);
    if (item.item?.length) {
      flattened.push(...flattenItems(item.item));
    }
  }
  return flattened;
}

function firstAnswer(item) {
  return item?.answer?.[0];
}

function extractAnswerValue(answer) {
  if (!answer) {
    return undefined;
  }
  return (
    answer.valueCoding?.code ??
    answer.valueCoding?.display ??
    answer.valueDateTime ??
    answer.valueDate ??
    answer.valueString ??
    answer.valueUri ??
    answer.valueBoolean ??
    answer.valueDecimal ??
    answer.valueInteger ??
    answer.valueTime ??
    answer.text
  );
}

function normalizeReferenceValue(reference) {
  if (!reference) {
    return undefined;
  }
  if (typeof reference === 'string') {
    return reference;
  }
  if (reference.reference) {
    return reference.reference;
  }
  return undefined;
}

function normalizeToken(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function codeableConcept(code, display) {
  return {
    coding: [{ system: CODE_SYSTEM, code, display }],
    text: display,
  };
}

function component(code, display, value) {
  return {
    code: codeableConcept(code, display),
    ...value,
  };
}

function identifier(system, value) {
  return { system, value };
}

function questionnaireReferenceExtension(reference) {
  return [{ url: 'https://hiivecare.example/fhir/StructureDefinition/origin-questionnaire-response', valueReference: { reference } }];
}

function mergeExtensions(existing, additions) {
  return [...(existing || []), ...(additions || [])];
}

function isTruthy(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

module.exports = {
  handler,
};
