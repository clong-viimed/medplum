// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  type Ccda,
  type CcdaEntry,
  type CcdaObservation,
  type CcdaSection,
  convertCcdaToFhir,
  convertXmlToCcda,
  mapCcdaCodeToCodeableConcept,
  mapCcdaToFhirDateTime,
} from '@medplum/ccda';
import { allOk, badRequest, ContentType, createReference, OperationOutcomeError } from '@medplum/core';
import type {
  Bundle,
  Condition,
  DocumentReference,
  Encounter,
  Meta,
  Observation,
  OperationDefinition,
  Patient,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';

export const operation = {
  resourceType: 'OperationDefinition',
  id: 'ccda-import',
  name: 'C-CDA Import',
  title: 'C-CDA Import',
  status: 'active',
  kind: 'operation',
  code: 'ccda-import',
  resource: ['Patient'],
  system: false,
  type: false,
  instance: true,
  parameter: [],
} satisfies OperationDefinition;

export async function ccdaImportHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  if (typeof req.body !== 'string' || !req.body.trim()) {
    throw new OperationOutcomeError(badRequest('C-CDA XML body is required'));
  }

  const patient = await ctx.repo.readResource<Patient>('Patient', id);
  const patientRef = createReference(patient);

  let ccda: Ccda;
  let converted: Bundle;
  try {
    ccda = convertXmlToCcda(req.body);
    converted = convertCcdaToFhir(ccda, { ignoreUnsupportedSections: true });
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Invalid C-CDA XML'), { cause: err as Error });
  }

  const importedResources = getConvertedClinicalResources(converted, patientRef, patient);
  const fallbackResources = importedResources.length > 0 ? [] : getFallbackClinicalResources(ccda, patientRef, patient);

  const persisted: Resource[] = [];
  for (const resource of importedResources.length > 0 ? importedResources : fallbackResources) {
    persisted.push(await ctx.repo.createResource(resource));
  }

  const encounterRef = persisted.find((resource) => resource.resourceType === 'Encounter') as Encounter | undefined;
  const documentReference = buildDocumentReference(req.body, ccda, patientRef, patient, encounterRef);
  persisted.push(await ctx.repo.createResource(documentReference));

  return [
    allOk,
    {
      resourceType: 'Bundle',
      type: 'collection',
      entry: persisted.map((resource) => ({ resource })),
    } satisfies Bundle,
  ];
}

function getConvertedClinicalResources(
  bundle: Bundle,
  patientRef: Reference<Patient>,
  patient: Patient
): Resource[] {
  return (
    bundle.entry
      ?.map((entry) => entry.resource)
      .filter((resource): resource is Resource => !!resource)
      .filter((resource) => resource.resourceType !== 'Patient' && resource.resourceType !== 'Composition')
      .map((resource) => linkResourceToPatient(resource, patientRef, patient)) ?? []
  );
}

function getFallbackClinicalResources(ccda: Ccda, patientRef: Reference<Patient>, patient: Patient): Resource[] {
  const result: Resource[] = [];
  const sections =
    ccda.component?.structuredBody?.component?.flatMap((component: { section?: CcdaSection[] }) => component.section ?? []) ?? [];

  for (const section of sections) {
    const sectionCode = section.code?.['@_code'];
    switch (sectionCode) {
      case '11450-4':
        result.push(...extractConditions(section.entry ?? [], patientRef, patient));
        break;
      case '30954-2':
        result.push(...extractObservations(section.entry ?? [], patientRef, patient));
        break;
      case '46240-8':
        result.push(...extractEncounters(section.entry ?? [], patientRef, patient));
        break;
      default:
        break;
    }
  }

  return result;
}

function extractConditions(entries: CcdaEntry[], patientRef: Reference<Patient>, patient: Patient): Condition[] {
  const result: Condition[] = [];
  for (const entry of entries) {
    for (const act of entry.act ?? []) {
      for (const relationship of act.entryRelationship ?? []) {
        for (const observation of relationship.observation ?? []) {
          const code = mapCcdaCodeToCodeableConcept(observation.value as never);
          if (!code) {
            continue;
          }
          result.push({
            resourceType: 'Condition',
            id: randomUUID(),
            subject: patientRef,
            code,
            onsetDateTime: mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.low?.['@_value']),
            clinicalStatus: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
            },
            verificationStatus: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
            },
            meta: buildImportMeta(patient),
          });
        }
      }
    }
  }
  return result;
}

function extractObservations(entries: CcdaEntry[], patientRef: Reference<Patient>, patient: Patient): Observation[] {
  const result: Observation[] = [];
  for (const entry of entries) {
    for (const organizer of entry.organizer ?? []) {
      for (const component of organizer.component ?? []) {
        for (const observation of component.observation ?? []) {
          const code = mapCcdaCodeToCodeableConcept(observation.code);
          if (!code) {
            continue;
          }

          const converted: Observation = {
            resourceType: 'Observation',
            id: randomUUID(),
            status: 'final',
            category: [
              {
                coding: [
                  { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' },
                ],
              },
            ],
            code,
            subject: patientRef,
            effectiveDateTime: mapCcdaToFhirDateTime(organizer.effectiveTime?.[0]?.['@_value']),
            meta: buildImportMeta(patient),
          };

          applyObservationValue(converted, observation);
          result.push(converted);
        }
      }
    }
  }
  return result;
}

function applyObservationValue(target: Observation, observation: CcdaObservation): void {
  const value = observation.value;
  if (!value) {
    return;
  }

  switch (value['@_xsi:type']) {
    case 'PQ':
      if (value['@_value']) {
        target.valueQuantity = {
          value: Number(value['@_value']),
          unit: value['@_unit'],
        };
      }
      break;
    case 'CD':
      target.valueCodeableConcept = mapCcdaCodeToCodeableConcept(value as never);
      break;
    case 'ST':
      target.valueString = value['#text'];
      break;
    default:
      break;
  }
}

function extractEncounters(entries: CcdaEntry[], patientRef: Reference<Patient>, patient: Patient): Encounter[] {
  const result: Encounter[] = [];
  for (const entry of entries) {
    for (const encounter of entry.encounter ?? []) {
      result.push({
        resourceType: 'Encounter',
        id: randomUUID(),
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        type: encounter.code ? [mapCcdaCodeToCodeableConcept(encounter.code) ?? { text: encounter.code['@_displayName'] }] : undefined,
        subject: patientRef,
        period: {
          start: mapCcdaToFhirDateTime(encounter.effectiveTime?.[0]?.low?.['@_value']),
          end: mapCcdaToFhirDateTime(encounter.effectiveTime?.[0]?.high?.['@_value']),
        },
        meta: buildImportMeta(patient),
      });
    }
  }
  return result;
}

function buildDocumentReference(
  xml: string,
  ccda: Ccda,
  patientRef: Reference<Patient>,
  patient: Patient,
  encounter: Encounter | undefined
): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    id: randomUUID(),
    status: 'current',
    type: mapCcdaCodeToCodeableConcept(ccda.code) ?? { text: ccda.title },
    subject: patientRef,
    date: mapCcdaToFhirDateTime(ccda.effectiveTime?.[0]?.['@_value']) ?? new Date().toISOString(),
    content: [
      {
        attachment: {
          contentType: ContentType.CDA_XML,
          title: ccda.title ?? 'Imported C-CDA',
          data: Buffer.from(xml).toString('base64'),
        },
      },
    ],
    context: encounter
      ? {
          encounter: [createReference(encounter)],
          period: encounter.period,
        }
      : undefined,
    meta: buildImportMeta(patient),
  };
}

function linkResourceToPatient<T extends Resource>(resource: T, patientRef: Reference<Patient>, patient: Patient): T {
  const linked = { ...resource };
  if ('subject' in linked) {
    (linked as T & { subject: Reference<Patient> }).subject = patientRef;
  }
  if ('patient' in linked) {
    (linked as T & { patient: Reference<Patient> }).patient = patientRef;
  }
  linked.meta = {
    ...linked.meta,
    ...buildImportMeta(patient),
  };
  return linked;
}

function buildImportMeta(patient: Patient): Meta {
  return {
    account: patient.meta?.account,
    accounts: patient.meta?.accounts,
  };
}