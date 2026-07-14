#!/usr/bin/env node
// Load clinical decision-flow Questionnaire resources into Medplum
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { readdir, readFile } from 'node:fs/promises';
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
const DATA_DIR = '../../medplum-provider/src/data/decision-flows';

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

  const dir = resolve(import.meta.dirname, DATA_DIR);
  const files = await readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  console.log(`Loading ${jsonFiles.length} decision-flow Questionnaire resource(s)...`);

  for (const file of jsonFiles) {
    const text = await readFile(resolve(dir, file), 'utf8');
    const questionnaire = JSON.parse(text);

    if (questionnaire.resourceType !== 'Questionnaire') {
      console.log(`  Skipping ${file}: not a Questionnaire`);
      continue;
    }

    const existing = await medplum.searchOne('Questionnaire', { url: questionnaire.url });
    if (existing) {
      const updated = await medplum.updateResource({ ...questionnaire, id: existing.id });
      console.log(`  Updated: ${getReferenceString(updated)} (${file})`);
    } else {
      const created = await medplum.createResource(questionnaire);
      console.log(`  Created: ${getReferenceString(created)} (${file})`);
    }
  }

  console.log('\nDecision-flow Questionnaires loaded successfully.');
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
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/load-decision-flows.mjs'
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
  console.log(`Usage: node scripts/load-decision-flows.mjs

Loads the clinical decision-flow Questionnaire resources into Medplum.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/load-decision-flows.mjs
`);
}
