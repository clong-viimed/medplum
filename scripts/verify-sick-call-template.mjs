#!/usr/bin/env node
// Verify that the Sick Call PlanDefinition creates Task checklist items via $apply
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
const SICK_CALL_URL = 'https://hiivehealth.com/plandefinition/sick-call';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});

async function main() {
  const medplum = await createMedplumClientFromEnv();

  console.log('Searching for Sick Call PlanDefinition...');
  const planDefinition = await medplum.searchOne('PlanDefinition', { url: SICK_CALL_URL });
  if (!planDefinition?.id) {
    throw new Error(`Sick Call PlanDefinition not found at ${SICK_CALL_URL}. Run load-sick-call-template.mjs first.`);
  }
  console.log(`  Found: PlanDefinition/${planDefinition.id}`);

  console.log('\nSearching for a demo patient...');
  const patient = await medplum.searchOne('Patient', { _id: '5506b4b2-6557-4876-8367-7e398914bce4' });
  if (!patient?.id) {
    throw new Error('Demo patient not found. Load the occhealth demo data first.');
  }
  console.log(`  Found: Patient/${patient.id}`);

  console.log('\nSearching for a demo practitioner...');
  const practitioner = await medplum.searchOne('Practitioner', { _id: '59ea2d1d-f436-437c-a785-74850bddbfd3' });
  if (!practitioner?.id) {
    throw new Error('Demo practitioner not found. Load the occhealth demo data first.');
  }
  console.log(`  Found: Practitioner/${practitioner.id}`);

  console.log('\nCreating test Appointment...');
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start,
    end,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' },
    ],
  });
  console.log(`  Created: Appointment/${appointment.id}`);

  console.log('\nCreating test Encounter...');
  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patient.id}` },
    appointment: [{ reference: `Appointment/${appointment.id}` }],
    participant: [{ individual: { reference: `Practitioner/${practitioner.id}` } }],
  });
  console.log(`  Created: Encounter/${encounter.id}`);

  console.log('\nApplying Sick Call PlanDefinition via $apply...');
  const applyResult = await medplum.post(
    medplum.fhirUrl('PlanDefinition', planDefinition.id, '$apply'),
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'subject', valueString: `Patient/${patient.id}` },
        { name: 'encounter', valueString: `Encounter/${encounter.id}` },
        { name: 'practitioner', valueString: `Practitioner/${practitioner.id}` },
      ],
    }
  );
  console.log(`  $apply returned: ${applyResult.resourceType}/${applyResult.id || 'n/a'}`);

  console.log('\nSearching for Tasks linked to the encounter...');
  const tasks = await medplum.searchResources('Task', `encounter=Encounter/${encounter.id}`);
  console.log(`  Found ${tasks.length} Task(s):`);
  for (const task of tasks) {
    console.log(`    - [${task.status}] ${task.code?.coding?.[0]?.display || task.code?.text || task.id}: ${task.description || task.title || '(no title)'}`);
  }

  const expectedTaskCount = planDefinition.action?.length ?? 0;
  if (tasks.length < expectedTaskCount) {
    throw new Error(`Expected at least ${expectedTaskCount} tasks, but found ${tasks.length}`);
  }

  console.log(`\n✅ Slice 2.3 verified: PlanDefinition/$apply created ${tasks.length} checklist Task(s).`);
}

async function createMedplumClientFromEnv() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;

  const medplum = new MedplumClient({
    baseUrl,
    clientId: process.env.MEDPLUM_CLIENT_ID,
    storage: new ClientStorage(new MemoryStorage()),
  });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    medplum.setAccessToken(process.env.MEDPLUM_ACCESS_TOKEN);
    return medplum;
  }

  if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
    return medplum;
  }

  if (process.env.MEDPLUM_EMAIL && process.env.MEDPLUM_PASSWORD) {
    const loginResult = await medplum.startLogin(
      {
        email: process.env.MEDPLUM_EMAIL,
        password: process.env.MEDPLUM_PASSWORD,
        ...(process.env.MEDPLUM_PROJECT_ID ? { projectId: process.env.MEDPLUM_PROJECT_ID } : {}),
      },
      { remember: false }
    );
    if (loginResult.code) {
      await medplum.processCode(loginResult.code);
    }
    return medplum;
  }

  throw new Error(
    'Set MEDPLUM_ACCESS_TOKEN, MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET, or MEDPLUM_EMAIL/MEDPLUM_PASSWORD before running.\n' +
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-sick-call-template.mjs'
  );
}

function parseArgs(argv) {
  const parsed = { help: false };
  const knownArgs = new Set(['--help']);
  for (const arg of argv) {
    if (!knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (arg === '--help') {
      parsed.help = true;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-sick-call-template.mjs

Verifies that the Sick Call PlanDefinition creates checklist Task resources via $apply.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-sick-call-template.mjs
`);
}
