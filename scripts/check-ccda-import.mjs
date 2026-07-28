#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';

const baseUrl = 'https://api.ehr.hiivehealth.net/';

function createStorageShim() {
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
  return new ClientStorage(memoryStore);
}

async function main() {
  const medplum = new MedplumClient({
    baseUrl,
    cacheTime: 0,
    storage: createStorageShim(),
  });

  const loginParams = {
    email: process.env.MEDPLUM_EMAIL,
    password: process.env.MEDPLUM_PASSWORD,
    scope: 'openid profile email',
    redirectUri: 'https://app.ehr.hiivehealth.net/',
  };
  const loginResult = await medplum.startLogin(loginParams);
  if (loginResult.code) {
    await medplum.processCode(loginResult.code, loginParams);
  }

  const patientId = '163d8eff-7780-42d1-845e-3b6fd64af37c';

  const patient = await medplum.readResource('Patient', patientId);
  console.log('Patient:', patient.name?.[0]?.given?.[0], patient.name?.[0]?.family);
  console.log('Patient meta.account:', JSON.stringify(patient.meta?.account));
  console.log('Patient meta.accounts:', JSON.stringify(patient.meta?.accounts));

  const resourceTypes = ['Condition', 'Observation', 'Encounter', 'DocumentReference', 'DiagnosticReport', 'MedicationRequest'];
  for (const rt of resourceTypes) {
    const bundle = await medplum.search(rt, { patient: `Patient/${patientId}`, _count: 10 });
    console.log(`\n${rt}: ${bundle.total ?? bundle.entry?.length ?? 0} found`);
    for (const entry of bundle.entry ?? []) {
      const r = entry.resource;
      console.log(`  - ${r.resourceType}/${r.id} lastUpdated=${r.meta?.lastUpdated} project=${r.meta?.project} account=${JSON.stringify(r.meta?.account)} accounts=${JSON.stringify(r.meta?.accounts?.map(a => a.display || a.reference))}`);
      if (r.subject) console.log(`    subject: ${JSON.stringify(r.subject)}`);
      if (r.encounter) console.log(`    encounter: ${JSON.stringify(r.encounter)}`);
      if (r.context) console.log(`    context: ${JSON.stringify(r.context)}`);
    }
  }

  console.log('\n--- Recently created resources (last 24h) ---');
  for (const rt of ['Patient', ...resourceTypes]) {
    const bundle = await medplum.search(rt, { _lastUpdated: 'ge2026-07-27', _count: 20, _sort: '-_lastUpdated' });
    if (bundle.entry?.length) {
      console.log(`\n${rt}: ${bundle.total ?? bundle.entry.length} recent`);
      for (const entry of bundle.entry) {
        const r = entry.resource;
        const name = r.resourceType === 'Patient' ? `${r.name?.[0]?.given?.[0]} ${r.name?.[0]?.family}` : '';
        console.log(`  - ${r.resourceType}/${r.id} lastUpdated=${r.meta?.lastUpdated} ${name} account=${JSON.stringify(r.meta?.account)}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
