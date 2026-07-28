#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import { readFileSync } from 'node:fs';

const baseUrl = 'https://api.ehr.hiivehealth.net/';
const patientId = process.argv[2] || '163d8eff-7780-42d1-845e-3b6fd64af37c';
const xmlPath = process.argv[3] || '/Users/paulwinterling/Desktop/sample-ccda copy.xml';

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

  const xml = readFileSync(xmlPath, 'utf-8');

  // Approach 1: POST XML directly to $ccda-import
  console.log('Testing Patient/{id}/$ccda-import with raw XML...');
  try {
    const result = await medplum.post(
      medplum.fhirUrl('Patient', patientId, '$ccda-import'),
      xml,
      'application/xml'
    );
    console.log('Success:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed raw XML:', normalizeErrorString(err));
  }

  // Approach 2: POST with Parameters resource containing the XML string
  console.log('\nTesting Patient/{id}/$ccda-import with Parameters...');
  try {
    const result = await medplum.post(medplum.fhirUrl('Patient', patientId, '$ccda-import'), {
      resourceType: 'Parameters',
      parameter: [{ name: 'data', valueString: xml }],
    });
    console.log('Success:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed Parameters:', normalizeErrorString(err));
  }

  // Approach 3: Check CapabilityStatement for ccda operations
  console.log('\nChecking CapabilityStatement for C-CDA operations...');
  try {
    const cap = await medplum.get(medplum.fhirUrl('metadata'));
    const patientOps = cap.rest?.[0]?.resource?.find((r) => r.type === 'Patient')?.operation ?? [];
    console.log('Patient operations:', JSON.stringify(patientOps.map((o) => o.name), null, 2));
  } catch (err) {
    console.error('Failed metadata:', normalizeErrorString(err));
  }
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
