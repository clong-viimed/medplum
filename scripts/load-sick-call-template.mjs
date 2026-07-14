#!/usr/bin/env node
// Polyfill browser globals for MedplumClient in Node.js
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
const DATA_DIR = '../../medplum-provider/src/data/sick-call-template';

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

  const tasksBundleText = await readFile(resolve(import.meta.dirname, `${DATA_DIR}/checklist-tasks.json`), 'utf8');
  const tasksBundle = JSON.parse(tasksBundleText);
  const planDefinitionText = await readFile(
    resolve(import.meta.dirname, `${DATA_DIR}/sick-call-plan-definition.json`),
    'utf8'
  );
  const planDefinition = JSON.parse(planDefinitionText);

  console.log('Loading Sick Call checklist ActivityDefinitions...');
  const tasksResult = await medplum.executeBatch(tasksBundle);
  reportResult(tasksResult, 'ActivityDefinition');

  console.log('Loading Sick Call PlanDefinition...');
  const existing = await medplum.searchOne('PlanDefinition', {
    url: 'https://hiivehealth.com/plandefinition/sick-call',
  });
  if (existing) {
    const updated = await medplum.updateResource({ ...planDefinition, id: existing.id });
    console.log(`  Updated PlanDefinition: ${getReferenceString(updated)}`);
  } else {
    const created = await medplum.createResource(planDefinition);
    console.log(`  Created PlanDefinition: ${getReferenceString(created)}`);
  }

  console.log('\nSick Call template loaded successfully.');
}

function reportResult(bundle, resourceType) {
  const errors = bundle.entry?.filter((e) => e.response?.status && !e.response.status.startsWith('2')) ?? [];
  if (errors.length > 0) {
    console.error(`\n${errors.length} bundle entry(ies) failed:`);
    for (const error of errors) {
      console.error(`  - ${error.response?.location || error.response?.status}: ${JSON.stringify(error.response?.outcome)}`);
    }
    throw new Error(`${resourceType} bundle failed to load`);
  }

  const created = bundle.entry?.filter((e) => e.response?.status === '201') ?? [];
  const existing = bundle.entry?.filter((e) => e.response?.status === '200') ?? [];
  console.log(`  ${created.length} created, ${existing.length} already existed.`);
}

function getReferenceString(resource) {
  return `${resource.resourceType}/${resource.id}`;
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
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/load-sick-call-template.mjs'
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
  console.log(`Usage: node scripts/load-sick-call-template.mjs

Loads the Sick Call visit template (checklist ActivityDefinitions + PlanDefinition) into Medplum.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/load-sick-call-template.mjs
`);
}
