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

  const membership = await medplum.searchOne('ProjectMembership', {
    identifier: 'https://hiivehealth.com/fhir/identifier/nevada-demo|nevada-demo-membership-payerSarah',
  });

  console.log('Membership:', JSON.stringify(membership, null, 2));

  const policyRef = membership?.access?.[0]?.policy?.reference ?? membership?.accessPolicy?.reference;
  if (policyRef) {
    const policyId = policyRef.split('/')[1];
    const policy = await medplum.readResource('AccessPolicy', policyId);
    console.log('\nAccessPolicy resource types:', policy.resource?.map((r) => r.resourceType));
    console.log('\nFull AccessPolicy:', JSON.stringify(policy, null, 2));
  }
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
