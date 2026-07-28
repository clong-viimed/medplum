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

  const ids = [
    ['Condition', '6c22cc5a-abc6-4cef-92bf-cb5b67dd8762'],
    ['Observation', '081e1cfb-8058-4089-b08e-ff6b01c8a618'],
    ['Encounter', 'bfce5097-01d4-4747-b9c3-163ab0448466'],
    ['DocumentReference', '9b482338-e7b6-41e5-8608-055089e0e603'],
  ];

  for (const [rt, id] of ids) {
    try {
      await medplum.deleteResource(rt, id);
      console.log('deleted', rt, id);
    } catch (e) {
      console.error('failed', rt, id, normalizeErrorString(e));
    }
  }
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
