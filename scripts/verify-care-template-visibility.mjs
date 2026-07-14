#!/usr/bin/env node
// Verify which care templates the provider demo user can see.
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

const EXPECTED_TEMPLATES = [
  { url: 'https://hiivecare.example/fhir/PlanDefinition/occupational-exposure-follow-up-visit', name: 'OccupationalExposureFollowUpVisit' },
  { url: 'https://hiivehealth.com/plandefinition/sick-call', name: 'SickCallVisit' },
  { url: 'https://hiivehealth.com/plandefinition/soap-note', name: 'SoapNoteVisit' },
];

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
  } else if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
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
    throw new Error('Set MEDPLUM_ACCESS_TOKEN, MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET, or MEDPLUM_EMAIL/MEDPLUM_PASSWORD');
  }

  console.log('Searching for care templates with provider credentials ...\n');
  const visible = [];
  const missing = [];

  for (const template of EXPECTED_TEMPLATES) {
    const results = await medplum.searchResources(
      'PlanDefinition',
      new URLSearchParams([
        ['url', template.url],
        ['_count', '1'],
      ])
    );

    if (results.length > 0) {
      visible.push(template.name);
      console.log(`  ✅ ${template.name}`);
    } else {
      missing.push(template.name);
      console.log(`  ❌ ${template.name}`);
    }
  }

  console.log(`\nVisible: ${visible.length}/${EXPECTED_TEMPLATES.length}`);
  if (missing.length > 0) {
    console.log(`\nMissing templates: ${missing.join(', ')}`);
    console.log('If a template exists but is not visible, the provider AccessPolicy criteria may be too restrictive.');
    process.exitCode = 1;
  }
}
