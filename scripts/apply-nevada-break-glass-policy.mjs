#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';

globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;

const BASE_URL = process.env.MEDPLUM_BASE_URL || 'https://api.ehr.hiivehealth.net/';
const PROJECT_ID = process.env.MEDPLUM_PROJECT_ID || '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
const POLICY_ID = process.env.NEVADA_BREAK_GLASS_POLICY_ID || '27a0a676-34a9-4347-b958-b6588e1c2415';
const POLICY_NAME = 'Nevada HIE Provider Break-Glass Production Policy';

function createStorageShim() {
  const memoryStore = new MemoryStorage();
  globalThis.sessionStorage = memoryStore;
  globalThis.localStorage = memoryStore;
  globalThis.location = { protocol: 'https:', hostname: new URL(BASE_URL).hostname, href: BASE_URL };
  globalThis.window = {
    crypto: globalThis.crypto,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    TextDecoder,
    TextEncoder,
    location: globalThis.location,
  };
  return new ClientStorage(memoryStore);
}

function readOnly(resourceType, criteria) {
  return {
    resourceType,
    interaction: ['read', 'search', 'history', 'vread'],
    readonly: true,
    ...(criteria ? { criteria } : {}),
  };
}

function patientScoped(resourceType) {
  return readOnly(resourceType, `${resourceType}?_compartment=Patient/%patient.id`);
}

function buildPolicy() {
  return {
    resourceType: 'AccessPolicy',
    name: POLICY_NAME,
    meta: { project: PROJECT_ID },
    resource: [
      readOnly('Patient', 'Patient?_id=%patient.id'),
      readOnly('Appointment', 'Appointment?practitioner=%profile'),
      readOnly('Schedule', 'Schedule?actor=%profile'),
      patientScoped('Encounter'),
      patientScoped('Condition'),
      patientScoped('Observation'),
      patientScoped('DiagnosticReport'),
      patientScoped('ServiceRequest'),
      patientScoped('Specimen'),
      patientScoped('AllergyIntolerance'),
      patientScoped('MedicationRequest'),
      patientScoped('Immunization'),
      patientScoped('Procedure'),
      patientScoped('ClinicalImpression'),
      patientScoped('Composition'),
      patientScoped('DocumentReference'),
      patientScoped('Consent'),
      patientScoped('Provenance'),
      {
        resourceType: 'QuestionnaireResponse',
        interaction: ['create', 'read', 'search', 'update', 'history', 'vread'],
        criteria: 'QuestionnaireResponse?_compartment=Patient/%patient.id',
      },
      {
        resourceType: 'AuditEvent',
        interaction: ['create', 'read', 'search', 'history', 'vread'],
      },
    ],
  };
}

async function loginAdmin() {
  const client = new MedplumClient({ baseUrl: BASE_URL, cacheTime: 0, storage: createStorageShim() });
  const loginParams = {
    email: process.env.MEDPLUM_EMAIL || 'admin@example.com',
    password: process.env.MEDPLUM_PASSWORD || 'medplum_admin',
    scope: 'openid profile email',
    redirectUri: 'https://app.ehr.hiivehealth.net/',
    projectId: PROJECT_ID,
  };
  let result = await client.startLogin(loginParams);
  if (!result.code && result.memberships?.length) {
    const membership = result.memberships.find((candidate) => candidate.project?.reference === `Project/${PROJECT_ID}`);
    if (!membership?.id) {
      throw new Error(`No active ProjectMembership found for target project ${PROJECT_ID}.`);
    }
    result = await client.post('auth/profile', { login: result.login, profile: membership.id });
  }
  if (result.code) {
    await client.processCode(result.code, loginParams);
  } else {
    throw new Error(`Unable to complete login for target project ${PROJECT_ID}.`);
  }
  return client;
}

async function main() {
  const policy = buildPolicy();
  const client = await loginAdmin();
  let existing = await client.searchOne('AccessPolicy', { name: POLICY_NAME });
  if (existing) {
    const updated = await client.updateResource({ ...existing, ...policy, id: existing.id });
    console.log(JSON.stringify({ action: 'updated', id: updated.id, name: updated.name }, null, 2));
    return;
  }
  try {
    existing = await client.readResource('AccessPolicy', POLICY_ID);
  } catch (error) {
    if (error?.status !== 404 && !/not found|404/i.test(normalizeErrorString(error))) {
      throw error;
    }
  }
  if (existing) {
    const updated = await client.updateResource({ ...existing, ...policy, id: POLICY_ID });
    console.log(JSON.stringify({ action: 'updated', id: updated.id, name: updated.name }, null, 2));
    return;
  }
  const created = await client.createResource(policy);
  console.log(JSON.stringify({ action: 'created', id: created.id, name: created.name, expectedId: POLICY_ID }, null, 2));
}

main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});
