#!/usr/bin/env node

import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import { buildCaliforniaDemoFoundation, validateCaliforniaDemoFoundation } from './california-hie-demo-fixtures.mjs';

const DEFAULT_BASE_URL = 'https://api.ehr.hiivehealth.net/';

function parseArgs(argv) {
  return { help: argv.includes('--help'), remote: argv.includes('--remote') };
}

function printHelp() {
  console.log(`Usage: node scripts/validate-california-hie-demo.mjs [--remote] [--help]

Validates the California HIE demo fixture locally. With --remote, verifies that
every deterministic fixture resource is readable from the configured FHIR server.

Environment:
  MEDPLUM_BASE_URL      Defaults to ${DEFAULT_BASE_URL}
  MEDPLUM_ACCESS_TOKEN  Required with --remote
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

async function validateRemoteResources(resources) {
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Set MEDPLUM_ACCESS_TOKEN before running remote validation.');
  }

  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL,
    cacheTime: 0,
    storage: createStorageShim(),
  });
  medplum.setAccessToken(accessToken);

  const missingResources = [];
  for (const resource of resources) {
    try {
      await medplum.readResource(resource.resourceType, resource.id);
    } catch {
      missingResources.push(`${resource.resourceType}/${resource.id}`);
    }
  }
  if (missingResources.length) {
    throw new Error(`California demo resources are unavailable:\n${missingResources.join('\n')}`);
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

  if (args.remote) {
    await validateRemoteResources(resources);
    console.log(`California demo remote readiness is valid: ${resources.length} resources are readable.`);
    return;
  }

  console.log(`California demo local readiness is valid: ${resources.length} fixture resources.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});