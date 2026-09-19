#!/usr/bin/env node

import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  CALIFORNIA_DEMO_TAG_SYSTEM,
  buildCaliforniaDemoFoundation,
  validateCaliforniaDemoFoundation,
} from './california-hie-demo-fixtures.mjs';

const DEFAULT_BASE_URL = 'https://api.ehr.hiivehealth.net/';

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help'),
  };
}

function printHelp() {
  console.log(`Usage: node scripts/seed-california-hie-demo.mjs [--dry-run] [--help]

Seeds synthetic California HIE clinical-viewer resources: organizations,
patients, clinical records, coverage and care-program records, SDOH observations,
and document metadata.

Environment:
  MEDPLUM_BASE_URL      Defaults to ${DEFAULT_BASE_URL}
  MEDPLUM_ACCESS_TOKEN  Required unless --dry-run is used

Examples:
  node scripts/seed-california-hie-demo.mjs --dry-run
  MEDPLUM_ACCESS_TOKEN=... node scripts/seed-california-hie-demo.mjs
`);
}

function createStorageShim() {
  const memoryStore = new MemoryStorage();
  globalThis.sessionStorage = memoryStore;
  globalThis.localStorage = memoryStore;
  globalThis.TextDecoder = TextDecoder;
  globalThis.TextEncoder = TextEncoder;
  globalThis.location = { protocol: 'https:', hostname: 'api.ehr.hiivehealth.net' };
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

async function seedResources(resources) {
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Set MEDPLUM_ACCESS_TOKEN before writing California demo resources.');
  }

  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL,
    cacheTime: 0,
    storage: createStorageShim(),
  });
  medplum.setAccessToken(accessToken);

  for (const resource of resources) {
    if (!resource.id) {
      throw new Error(`Missing deterministic ID for ${resource.resourceType}.`);
    }
    await medplum.upsertResource(resource);
    console.log(`Seeded ${resource.resourceType}/${resource.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const resources = buildCaliforniaDemoFoundation();
  const errors = validateCaliforniaDemoFoundation(resources);
  if (errors.length) {
    throw new Error(`California demo foundation is invalid:\n${errors.join('\n')}`);
  }

  const counts = resources.reduce((result, resource) => {
    result[resource.resourceType] = (result[resource.resourceType] || 0) + 1;
    return result;
  }, {});

  if (args.dryRun) {
    console.log(`California demo foundation is valid: ${JSON.stringify(counts)}.`);
    return;
  }

  await seedResources(resources);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});