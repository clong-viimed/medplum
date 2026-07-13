#!/usr/bin/env node
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  const bundlePath = resolve(import.meta.dirname, '../../medplum-provider/src/data/sample-location-hierarchy-bundle.json');
  const bundleText = await readFile(bundlePath, 'utf8');
  const bundle = JSON.parse(bundleText);

  const medplum = await createMedplumClientFromEnv();

  console.log(`Posting Location hierarchy bundle to ${medplum.getBaseUrl()} ...`);
  const result = await medplum.executeBatch(bundle);

  const errors = result.entry?.filter((e) => e.response?.status && !e.response.status.startsWith('2')) ?? [];
  if (errors.length > 0) {
    console.error(`\n${errors.length} bundle entry(ies) failed:`);
    for (const error of errors) {
      console.error(`  - ${error.response?.location || error.response?.status}: ${JSON.stringify(error.response?.outcome)}`);
    }
    throw new Error('Location hierarchy bundle failed to load');
  }

  const created = result.entry?.filter((e) => e.response?.status === '201') ?? [];
  const existing = result.entry?.filter((e) => e.response?.status === '200') ?? [];
  console.log(`\nSuccess: ${created.length} Location resources created, ${existing.length} already existed.`);
  for (const entry of result.entry ?? []) {
    const location = entry.resource ?? {};
    console.log(`  - ${location.name} (${entry.response?.status}): ${entry.response?.location}`);
  }
}

async function createMedplumClientFromEnv() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;

  const medplum = new MedplumClient({
    baseUrl,
    clientId: process.env.MEDPLUM_CLIENT_ID,
  });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    medplum.setAccessToken(process.env.MEDPLUM_ACCESS_TOKEN);
    return medplum;
  }

  if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
    return medplum;
  }

  throw new Error(
    'Set MEDPLUM_ACCESS_TOKEN or MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET before running.\n' +
      'Example: MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/load-location-hierarchy.mjs'
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
  console.log(`Usage: node scripts/load-location-hierarchy.mjs

Loads the sample Location hierarchy (building -> floor -> room -> station/bed) into Medplum.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_PROJECT_ID    Medplum project ID (default: ${DEFAULT_PROJECT_ID})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token (alternative to client credentials)

Example:
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/load-location-hierarchy.mjs
`);
}
