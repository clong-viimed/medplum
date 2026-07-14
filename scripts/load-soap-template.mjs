#!/usr/bin/env node
// Load the SOAP Note care template (PlanDefinition + ActivityDefinitions) into the Hiive Medplum server.
// Polyfill browser globals for MedplumClient when running in Node.js.
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  const baseDir = resolve(import.meta.dirname, '../../medplum-provider/src/data/soap-template');
  const tasksText = await readFile(resolve(baseDir, 'soap-checklist-tasks.json'), 'utf8');
  const planText = await readFile(resolve(baseDir, 'soap-note-plan-definition.json'), 'utf8');
  const tasksBundle = JSON.parse(tasksText);
  const planDefinition = JSON.parse(planText);

  const medplum = await createMedplumClientFromEnv();

  console.log(`Loading SOAP Note ActivityDefinitions to ${medplum.getBaseUrl()} ...`);
  const tasksResult = await medplum.executeBatch(tasksBundle);
  logBatchResult(tasksResult);

  console.log(`\nLoading SOAP Note PlanDefinition to ${medplum.getBaseUrl()} ...`);
  const existing = await medplum.searchResources(
    'PlanDefinition',
    new URLSearchParams([
      ['url', planDefinition.url],
      ['_count', '1'],
    ])
  );

  if (existing.length > 0) {
    const updated = await medplum.updateResource({ ...existing[0], ...planDefinition });
    console.log(`Updated PlanDefinition: ${updated.resourceType}/${updated.id}`);
  } else {
    const created = await medplum.createResource(planDefinition);
    console.log(`Created PlanDefinition: ${created.resourceType}/${created.id}`);
  }
}

function logBatchResult(result) {
  const errors = result.entry?.filter((e) => e.response?.status && !e.response.status.startsWith('2')) ?? [];
  if (errors.length > 0) {
    console.error(`\n${errors.length} bundle entry(ies) failed:`);
    for (const error of errors) {
      console.error(`  - ${error.response?.location || error.response?.status}: ${JSON.stringify(error.response?.outcome)}`);
    }
    throw new Error('SOAP Note ActivityDefinition bundle failed to load');
  }

  for (const entry of result.entry ?? []) {
    const resource = entry.resource ?? {};
    console.log(`  - ${resource.title || resource.name || resource.resourceType} (${entry.response?.status}): ${entry.response?.location}`);
  }
}

async function createMedplumClientFromEnv() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;
  const projectId = process.env.MEDPLUM_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  const medplum = new MedplumClient({
    baseUrl,
    clientId: process.env.MEDPLUM_CLIENT_ID,
    storage: new ClientStorage(new MemoryStorage()),
  });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    medplum.setAccessToken(process.env.MEDPLUM_ACCESS_TOKEN);
    return medplum;
  }

  if (!process.env.MEDPLUM_EMAIL || !process.env.MEDPLUM_PASSWORD) {
    throw new Error('Set MEDPLUM_EMAIL and MEDPLUM_PASSWORD, or MEDPLUM_ACCESS_TOKEN');
  }

  await medplum.startLogin(
    {
      email: process.env.MEDPLUM_EMAIL,
      password: process.env.MEDPLUM_PASSWORD,
      ...(process.env.MEDPLUM_PROJECT_ID ? { projectId } : {}),
    },
    { remember: false }
  );

  return medplum;
}

function parseArgs(argv) {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp() {
  console.log(`
Load the SOAP Note care template into the Hiive Medplum server.

Environment variables:
  MEDPLUM_BASE_URL    Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_PROJECT_ID  Medplum project ID (default: ${DEFAULT_PROJECT_ID})
  MEDPLUM_EMAIL       Email for password login
  MEDPLUM_PASSWORD    Password for password login
  MEDPLUM_ACCESS_TOKEN Optional access token for authentication

Usage:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin MEDPLUM_PROJECT_ID= node scripts/load-soap-template.mjs
`);
}
