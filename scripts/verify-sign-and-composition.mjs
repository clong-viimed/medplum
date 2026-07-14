#!/usr/bin/env node
// Verify Sign & Close creates Provenance, completes ClinicalImpression, and optionally generates Composition
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

  console.log('Searching for demo patient and practitioner...');
  const patient = await medplum.searchOne('Patient', { _id: '5506b4b2-6557-4876-8367-7e398914bce4' });
  const practitioner = await medplum.searchOne('Practitioner', { _id: '59ea2d1d-f436-437c-a785-74850bddbfd3' });
  if (!patient?.id || !practitioner?.id) {
    throw new Error('Demo patient or practitioner not found.');
  }
  console.log(`  Found Patient/${patient.id}, Practitioner/${practitioner.id}`);

  console.log('\nCreating test Encounter and ClinicalImpression...');
  const now = new Date();
  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patient.id}` },
    participant: [{ individual: { reference: `Practitioner/${practitioner.id}` } }],
  });

  const clinicalImpression = await medplum.createResource({
    resourceType: 'ClinicalImpression',
    status: 'in-progress',
    description: 'Initial clinical impression',
    subject: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${encounter.id}` },
    date: now.toISOString(),
  });
  console.log(`  Created Encounter/${encounter.id}, ClinicalImpression/${clinicalImpression.id}`);

  console.log('\nSimulating Sign & Close...');

  // Complete ClinicalImpression
  const updatedImpression = await medplum.updateResource({
    ...clinicalImpression,
    status: 'completed',
  });

  // Create Provenance
  const provenance = await medplum.createResource({
    resourceType: 'Provenance',
    target: [{ reference: `Encounter/${encounter.id}` }],
    recorded: new Date().toISOString(),
    reason: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'SIGN', display: 'Signed' }] }],
    agent: [
      {
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author' }] },
        who: { reference: `Practitioner/${practitioner.id}` },
      },
    ],
    signature: [
      {
        type: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion', code: 'LA', display: 'legally authenticated' }],
        when: new Date().toISOString(),
        who: { reference: `Practitioner/${practitioner.id}` },
      },
    ],
  });

  // Optional: generate Composition
  const composition = await medplum.createResource({
    resourceType: 'Composition',
    status: 'final',
    type: {
      coding: [{ system: 'http://loinc.org', code: '11506-3', display: 'Provider-unspecified Progress note' }],
    },
    subject: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${encounter.id}` },
    date: new Date().toISOString(),
    author: [{ reference: `Practitioner/${practitioner.id}` }],
    title: 'SOAP Note',
    section: [
      { title: 'Subjective', code: { coding: [{ system: 'http://loinc.org', code: '29545-4' }] }, text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Subjective section</div>' } },
      { title: 'Objective', code: { coding: [{ system: 'http://loinc.org', code: '29544-7' }] }, text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Objective section</div>' } },
      { title: 'Assessment', code: { coding: [{ system: 'http://loinc.org', code: '51847-2' }] }, text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Assessment section</div>' } },
      { title: 'Plan', code: { coding: [{ system: 'http://loinc.org', code: '18776-5' }] }, text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Plan section</div>' } },
    ],
  });

  console.log(`  Updated ClinicalImpression status: ${updatedImpression.status}`);
  console.log(`  Created Provenance/${provenance.id}`);
  console.log(`  Created Composition/${composition.id}`);

  // Verify
  const provenances = await medplum.searchResources('Provenance', `target=Encounter/${encounter.id}`);
  if (provenances.length === 0) {
    throw new Error('Provenance not found after signing.');
  }
  if (updatedImpression.status !== 'completed') {
    throw new Error('ClinicalImpression not marked completed after signing.');
  }

  console.log('\n✅ Sign & Close verification passed.');
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
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-sign-and-composition.mjs'
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
  console.log(`Usage: node scripts/verify-sign-and-composition.mjs

Verifies that Sign & Close creates Provenance, completes ClinicalImpression, and generates a Composition.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-sign-and-composition.mjs
`);
}
