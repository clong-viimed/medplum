#!/usr/bin/env node
// Verify the SOAP Note care template exists and PlanDefinition/$apply creates Tasks.
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';

const memoryStore = new MemoryStorage();
globalThis.sessionStorage = memoryStore;
globalThis.localStorage = memoryStore;
globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
globalThis.location = {
  protocol: 'https:',
  hostname: 'api.ehr.hiivehealth.net',
  href: 'https://api.ehr.hiivehealth.net/',
};
globalThis.window = {
  crypto: globalThis.crypto,
  btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
  atob: (str) => Buffer.from(str, 'base64').toString('binary'),
  TextDecoder,
  TextEncoder,
  location: globalThis.location,
};

const DEFAULT_BASE_URL = 'https://api.ehr.hiivehealth.net/';
const DEFAULT_PROJECT_ID = '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
const SOAP_PLAN_DEFINITION_URL = 'https://hiivehealth.com/plandefinition/soap-note';
const TEST_PATIENT_ID = process.env.TEST_PATIENT_ID;

main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});

async function main() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;
  const projectId = process.env.MEDPLUM_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  const medplum = new MedplumClient({
    baseUrl,
    clientId: process.env.MEDPLUM_CLIENT_ID,
    storage: new ClientStorage(new MemoryStorage()),
  });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    medplum.setAccessToken(process.env.MEDPLUM_ACCESS_TOKEN);
  } else if (process.env.MEDPLUM_EMAIL && process.env.MEDPLUM_PASSWORD) {
    await medplum.startLogin(
      {
        email: process.env.MEDPLUM_EMAIL,
        password: process.env.MEDPLUM_PASSWORD,
        ...(process.env.MEDPLUM_PROJECT_ID ? { projectId } : {}),
      },
      { remember: false }
    );
  } else {
    throw new Error('Set MEDPLUM_EMAIL and MEDPLUM_PASSWORD, or MEDPLUM_ACCESS_TOKEN');
  }

  console.log('Searching for SOAP Note PlanDefinition ...');
  const planDefinitions = await medplum.searchResources(
    'PlanDefinition',
    new URLSearchParams([
      ['url', SOAP_PLAN_DEFINITION_URL],
      ['_count', '1'],
    ])
  );

  if (planDefinitions.length === 0) {
    throw new Error(`SOAP Note PlanDefinition not found: ${SOAP_PLAN_DEFINITION_URL}`);
  }

  const planDefinition = planDefinitions[0];
  console.log(`Found PlanDefinition/${planDefinition.id} with ${planDefinition.action?.length ?? 0} action(s)`);

  for (const action of planDefinition.action ?? []) {
    console.log(`  - ${action.title}`);
  }

  const activityDefinitions = await medplum.searchResources(
    'ActivityDefinition',
    new URLSearchParams([
      ['url:below', 'https://hiivehealth.com/activitydefinition/soap-note'],
      ['_count', '10'],
    ])
  );
  console.log(`\nFound ${activityDefinitions.length} SOAP Note ActivityDefinition resource(s)`);

  if (!TEST_PATIENT_ID) {
    console.log('\nSet TEST_PATIENT_ID to verify PlanDefinition/$apply creates Tasks.');
    return;
  }

  const patient = await medplum.readResource('Patient', TEST_PATIENT_ID);
  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
    instantiatesCanonical: [{ reference: `PlanDefinition/${planDefinition.id}` }],
  });

  console.log(`\nCreated test Encounter/${encounter.id}`);
  console.log('Applying PlanDefinition/$apply ...');

  const applyResult = await medplum.post(
    medplum.fhirUrl('PlanDefinition', planDefinition.id, '$apply'),
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'subject', valueString: `Patient/${patient.id}` },
        { name: 'encounter', valueString: `Encounter/${encounter.id}` },
      ],
    }
  );

  const carePlan = applyResult;
  console.log(`$apply created ${carePlan.resourceType}/${carePlan.id}`);

  const tasks = await medplum.searchResources(
    'Task',
    new URLSearchParams([
      ['based-on', `CarePlan/${carePlan.id}`],
      ['_count', '10'],
    ])
  );

  console.log(`$apply created ${tasks.length} Task(s) with status '${tasks[0]?.status ?? 'N/A'}':`);
  for (const task of tasks) {
    console.log(`  - ${task.code?.text ?? task.id} (${task.status})`);
  }

  if (tasks.length !== 4) {
    throw new Error(`Expected 4 Tasks, got ${tasks.length}`);
  }

  console.log('\nSOAP Note template verification passed.');
}
