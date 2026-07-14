#!/usr/bin/env node
// Broaden the provider demo access policy so all Hiive care templates are visible.
// Polyfill browser globals for MedplumClient when running in Node.js.
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
const DEFAULT_PROJECT_ID = '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
const PROVIDER_ACCESS_POLICY_ID = '05fa99c3-6400-4d8c-af38-8b00b890315d';

const PROVIDER_CARE_TEMPLATE_URLS = [
  'https://hiivecare.example/fhir/PlanDefinition/occupational-exposure-follow-up-visit',
  'https://hiivehealth.com/plandefinition/sick-call',
  'https://hiivehealth.com/plandefinition/soap-note',
];

main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});

async function main() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;
  const projectId = process.env.MEDPLUM_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  const medplum = new MedplumClient({
    baseUrl,
    clientId: process.env.MEDPLUM_CLIENT_ID,
    storage: new ClientStorage(new MemoryStorage()),
  });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    medplum.setAccessToken(process.env.MEDPLUM_ACCESS_TOKEN);
  } else if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
  } else if (process.env.MEDPLUM_EMAIL && process.env.MEDPLUM_PASSWORD) {
    await medplum.startLogin(
      {
        email: process.env.MEDPLUM_EMAIL,
        password: process.env.MEDPLUM_PASSWORD,
        ...(process.env.MEDPLUM_PROJECT_ID ? { projectId } : {}),
      },
      { remember: false }
    );
  } else {
    throw new Error('Set MEDPLUM_ACCESS_TOKEN, MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET, or MEDPLUM_EMAIL/MEDPLUM_PASSWORD');
  }

  console.log(`Reading AccessPolicy/${PROVIDER_ACCESS_POLICY_ID} ...`);
  const accessPolicy = await medplum.readResource('AccessPolicy', PROVIDER_ACCESS_POLICY_ID);

  console.log('Current PlanDefinition rule:');
  const planDefinitionRule = accessPolicy.resource?.find((r) => r.resourceType === 'PlanDefinition');
  console.log(`  criteria: ${planDefinitionRule?.criteria ?? '(none)'}`);
  console.log(`  interactions: ${planDefinitionRule?.interaction?.join(', ') ?? '(none)'}`);

  const updated = { ...accessPolicy };
  updated.resource = [...(updated.resource || [])];
  const ruleIndex = updated.resource.findIndex((r) => r.resourceType === 'PlanDefinition');
  const rule = { ...(planDefinitionRule || { resourceType: 'PlanDefinition', interaction: [] }) };
  rule.criteria = `PlanDefinition?url=${PROVIDER_CARE_TEMPLATE_URLS.join(',')}`;

  if (ruleIndex >= 0) {
    updated.resource[ruleIndex] = rule;
  } else {
    updated.resource.push(rule);
  }

  console.log('\nUpdating PlanDefinition rule ...');
  const result = await medplum.updateResource(updated);

  console.log(`Updated AccessPolicy/${result.id}`);
  const newRule = result.resource?.find((r) => r.resourceType === 'PlanDefinition');
  console.log(`  criteria: ${newRule?.criteria}`);
}
