#!/usr/bin/env node
// Verify that SOAP section Questionnaires exist and can be discovered by URL
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

const EXPECTED_QUESTIONNAIRES = [
  { url: 'https://hiivehealth.com/questionnaire/soap-subjective', title: 'Subjective' },
  { url: 'https://hiivehealth.com/questionnaire/soap-objective', title: 'Objective' },
  { url: 'https://hiivehealth.com/questionnaire/soap-assessment', title: 'Assessment' },
  { url: 'https://hiivehealth.com/questionnaire/soap-plan', title: 'Plan' },
  { url: 'https://hiivehealth.com/questionnaire/review-of-systems', title: 'Review of Systems' },
];

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

  console.log('Verifying SOAP Questionnaire resources...\n');
  let missing = 0;

  for (const expected of EXPECTED_QUESTIONNAIRES) {
    const questionnaire = await medplum.searchOne('Questionnaire', { url: expected.url });
    if (questionnaire?.id) {
      console.log(`  ✅ ${expected.title}: Questionnaire/${questionnaire.id}`);
      const itemCount = questionnaire.item?.length ?? 0;
      console.log(`      ${itemCount} top-level item(s)`);
    } else {
      console.log(`  ❌ ${expected.title}: not found (${expected.url})`);
      missing++;
    }
  }

  if (missing > 0) {
    throw new Error(`${missing} questionnaire(s) missing. Run load-soap-questionnaires.mjs first.`);
  }

  console.log('\n✅ All SOAP Questionnaires are available.');
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
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-soap-questionnaires.mjs'
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
  console.log(`Usage: node scripts/verify-soap-questionnaires.mjs

Verifies that all SOAP section Questionnaire resources exist in Medplum.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-soap-questionnaires.mjs
`);
}
