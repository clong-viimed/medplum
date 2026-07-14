#!/usr/bin/env node
// Removes legacy sample Location resources from the Ubix Data project that are
// not part of the HiiveCare hierarchy and are not duty-location resources used
// by occupational health workflows.
//
// IMPORTANT: This script deletes resources. Run with --dry-run first.
//
// Usage:
//   MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/cleanup-legacy-locations.mjs --dry-run
//   MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/cleanup-legacy-locations.mjs --confirm

import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';

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

const HIIVE_LOCATION_IDENTIFIERS = new Set([
  'main-clinic',
  'main-clinic-floor-1',
  'exam-room-101',
  'exam-room-102',
  'exam-room-101-bed-a',
  'exam-room-101-bed-b',
  'exam-room-102-bed-a',
  'exam-room-102-bed-b',
]);

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

  console.log(`Loading active Locations from ${medplum.getBaseUrl()} ...\n`);

  const allLocations = await medplum.searchResources('Location', 'status=active&_count=1000');

  const legacyCandidates = [];
  const keptHiive = [];
  const keptDuty = [];

  for (const loc of allLocations) {
    const identifierValue = loc.identifier?.[0]?.value;
    if (identifierValue && HIIVE_LOCATION_IDENTIFIERS.has(identifierValue)) {
      keptHiive.push(loc);
      continue;
    }
    if (identifierValue?.startsWith('duty-location:')) {
      keptDuty.push(loc);
      continue;
    }
    legacyCandidates.push(loc);
  }

  console.log(`Found ${allLocations.length} active Locations:`);
  console.log(`  Keep (HiiveCare hierarchy): ${keptHiive.length}`);
  console.log(`  Keep (duty locations):      ${keptDuty.length}`);
  console.log(`  Legacy candidates:          ${legacyCandidates.length}\n`);

  const toDelete = [];
  const referenced = [];

  for (const loc of legacyCandidates) {
    const encounters = await medplum.searchResources('Encounter', `location=${loc.id}&_count=1`);
    if (encounters.length > 0) {
      referenced.push({ loc, reason: `referenced by ${encounters.length} Encounter(s)` });
    } else {
      toDelete.push(loc);
    }
  }

  if (referenced.length > 0) {
    console.log(`Referenced legacy Locations (will NOT delete): ${referenced.length}`);
    for (const { loc, reason } of referenced) {
      console.log(`  - ${loc.name} (${loc.id}) ${reason}`);
    }
    console.log('');
  }

  console.log(`Legacy Locations to delete: ${toDelete.length}`);
  for (const loc of toDelete) {
    console.log(`  - ${loc.name} (${loc.id})`);
  }

  if (args.dryRun) {
    console.log('\n--dry-run specified; no resources were deleted.');
    return;
  }

  if (!args.confirm) {
    console.log('\nThis script deletes resources. Re-run with --confirm to proceed, or --dry-run to preview.');
    process.exitCode = 1;
    return;
  }

  console.log('\nDeleting...');
  let deleted = 0;
  let failed = 0;

  for (const loc of toDelete) {
    try {
      await medplum.deleteResource('Location', loc.id);
      console.log(`  Deleted Location/${loc.id} (${loc.name})`);
      deleted++;
    } catch (error) {
      console.error(`  Failed to delete Location/${loc.id} (${loc.name}): ${normalizeErrorString(error)}`);
      failed++;
    }
  }

  console.log(`\nDone: ${deleted} deleted, ${failed} failed, ${referenced.length} skipped (referenced).`);
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

  throw new Error(
    'Set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET (ubix-data credentials).\n' +
      'Example: MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/cleanup-legacy-locations.mjs --dry-run'
  );
}

function parseArgs(argv) {
  const parsed = { help: false, dryRun: false, confirm: false };
  const knownArgs = new Set(['--help', '--dry-run', '--confirm']);
  for (const arg of argv) {
    if (!knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (arg === '--help') {
      parsed.help = true;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
    if (arg === '--confirm') {
      parsed.confirm = true;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/cleanup-legacy-locations.mjs [--dry-run] [--confirm]

Removes legacy sample Location resources from the Ubix Data project.

Keeps:
  - HiiveCare hierarchy Locations (identifier system https://hiivehealth.com/location-ids)
  - duty-location:* Locations used by occupational health exposure incident workflows

Deletes:
  - Unreferenced legacy sample Locations (e.g. duplicate Community Clinic, Behavioral Health Center, etc.)

Safety:
  - Always run with --dry-run first.
  - Resources referenced by Encounter.location are never deleted.
  - You must pass --confirm to actually delete.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     ubix-data ClientApplication ID
  MEDPLUM_CLIENT_SECRET ubix-data ClientApplication secret
  MEDPLUM_ACCESS_TOKEN  Existing access token (alternative to client credentials)

Examples:
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/cleanup-legacy-locations.mjs --dry-run
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/cleanup-legacy-locations.mjs --confirm
`);
}
