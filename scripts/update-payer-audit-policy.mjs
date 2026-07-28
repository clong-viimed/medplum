#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';

const baseUrl = process.env.MEDPLUM_BASE_URL || 'https://api.ehr.hiivehealth.net/';
const policyId = process.env.POLICY_ID || '44192478-3224-4dfb-87d5-baca3b3c192c';

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

  const existing = await medplum.searchOne('AccessPolicy', { _id: policyId });
  if (!existing) {
    throw new Error(`AccessPolicy ${policyId} not found`);
  }
  console.log(`Loaded policy: ${existing.name} (${existing.id})`);
  console.log(`Version: ${existing.meta?.versionId}`);

  const hasAuditEvent = existing.resource?.some((r) => r.resourceType === 'AuditEvent');
  if (hasAuditEvent) {
    console.log('AuditEvent permission already present, ensuring create is included...');
  }

  const resourceWithoutAuditEvent = (existing.resource || []).filter((r) => r.resourceType !== 'AuditEvent');
  const updated = {
    resourceType: 'AccessPolicy',
    id: existing.id,
    name: existing.name,
    resource: [
      ...resourceWithoutAuditEvent,
      {
        resourceType: 'AuditEvent',
        interaction: ['create', 'read', 'search', 'history', 'vread'],
      },
    ],
  };

  const result = await medplum.updateResource(updated);
  console.log('AuditEvent create permission added to payer roster AccessPolicy.');
  console.log(`New version: ${result.meta?.versionId}`);
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
