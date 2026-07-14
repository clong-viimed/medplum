#!/usr/bin/env node
// Polyfill sessionStorage for MedplumClient when running in Node.js
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

const memoryStore = new MemoryStorage();
globalThis.sessionStorage = memoryStore;
globalThis.localStorage = memoryStore;
globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
globalThis.location = { protocol: 'https:', hostname: 'api.ehr.hiivehealth.net', href: 'https://api.ehr.hiivehealth.net/' };
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
  const bundlePath = resolve(import.meta.dirname, '../../medplum-provider/src/data/sample-location-hierarchy-bundle.json');
  const bundleText = await readFile(bundlePath, 'utf8');
  const bundle = JSON.parse(bundleText);

  const medplum = await createMedplumClientFromEnv();

  console.log(`Upserting Location hierarchy to ${medplum.getBaseUrl()} ...`);

  // Map fullUrl (urn:uuid) to server-assigned Location id so partOf references can be resolved.
  const fullUrlToId = new Map();
  const created = [];
  const updated = [];
  const unchanged = [];

  // First pass: create or update each Location without partOf, building the fullUrl -> id map.
  for (const entry of bundle.entry ?? []) {
    const location = entry.resource;
    const identifier = location.identifier?.[0];
    if (!identifier) {
      console.warn(`Skipping Location without identifier: ${location.name}`);
      continue;
    }

    const searchToken = `identifier=${identifier.system}|${identifier.value}`;
    const existing = await medplum.searchResources('Location', searchToken);

    let saved;
    if (existing.length > 0) {
      const current = existing[0];
      const needsUpdate = current.name !== location.name ||
        current.status !== location.status ||
        current.physicalType?.coding?.[0]?.code !== location.physicalType?.coding?.[0]?.code;

      if (needsUpdate) {
        saved = await medplum.updateResource({ ...current, ...location, id: current.id, partOf: current.partOf });
        updated.push({ name: saved.name, id: saved.id });
      } else {
        saved = current;
        unchanged.push({ name: saved.name, id: saved.id });
      }
    } else {
      saved = await medplum.createResource({ ...location, partOf: undefined });
      created.push({ name: saved.name, id: saved.id });
    }

    fullUrlToId.set(entry.fullUrl, saved.id);
  }

  // Second pass: patch partOf references using the fullUrl -> id map.
  for (const entry of bundle.entry ?? []) {
    const location = entry.resource;
    if (!location.partOf?.reference) {
      continue;
    }

    const identifier = location.identifier?.[0];
    if (!identifier) {
      continue;
    }

    const parentId = fullUrlToId.get(location.partOf.reference);
    if (!parentId) {
      console.warn(`Could not resolve partOf reference ${location.partOf.reference} for ${location.name}`);
      continue;
    }

    const searchToken = `identifier=${identifier.system}|${identifier.value}`;
    const existing = await medplum.searchResources('Location', searchToken);
    const current = existing[0];

    const expectedPartOf = `Location/${parentId}`;
    if (current.partOf?.reference !== expectedPartOf) {
      await medplum.updateResource({ ...current, partOf: { reference: expectedPartOf, display: location.partOf.display } });
    }
  }

  console.log(`\nSuccess: ${created.length} created, ${updated.length} updated, ${unchanged.length} unchanged.`);
  for (const item of [...created, ...updated, ...unchanged]) {
    console.log(`  - ${item.name}: Location/${item.id}`);
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

  if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
    return medplum;
  }

  if (process.env.MEDPLUM_EMAIL && process.env.MEDPLUM_PASSWORD) {
    const loginResult = await medplum.startLogin(
      {
        email: process.env.MEDPLUM_EMAIL,
        password: process.env.MEDPLUM_PASSWORD,
        ...(process.env.MEDPLUM_PROJECT_ID ? { projectId } : {}),
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

IMPORTANT: Locations must be created inside the Ubix Data project so the provider demo user
can read them. Use the ubix-data ClientApplication credentials (recommended). Do not use the
super-admin account, because it is not a member of the Ubix Data project and will create
resources in the wrong project.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_PROJECT_ID    Medplum project ID (default: ${DEFAULT_PROJECT_ID})
  MEDPLUM_CLIENT_ID     Client application ID (recommended)
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token (alternative to client credentials)
  MEDPLUM_EMAIL         Project-scoped demo user email (alternative, must have write access)
  MEDPLUM_PASSWORD      Project-scoped demo user password

Examples:
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/load-location-hierarchy.mjs
  MEDPLUM_EMAIL=... MEDPLUM_PASSWORD=... MEDPLUM_PROJECT_ID=${DEFAULT_PROJECT_ID} node scripts/load-location-hierarchy.mjs
`);
}
