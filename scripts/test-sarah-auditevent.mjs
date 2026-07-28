#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import { randomUUID } from 'node:crypto';

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
    projectId: '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8',
    clientId: 'ec23c2e3-f4e6-4aaf-9938-77506a367d4c',
  };
  const loginResult = await medplum.startLogin(loginParams);
  if (loginResult.code) {
    await medplum.processCode(loginResult.code, loginParams);
  }

  const auditEvent = {
    resourceType: 'AuditEvent',
    id: randomUUID(),
    recorded: new Date().toISOString(),
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110113',
      display: 'Security Alert',
    },
    subtype: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: 'emergency-access',
        display: 'Emergency access (break the glass)',
      },
    ],
    action: 'R',
    outcome: '0',
    outcomeDesc: 'Test break glass as Sarah',
    agent: [
      {
        who: {
          reference: 'Practitioner/7cf5fe0a-9872-4f8e-baa1-e34d56d8a89e',
          display: 'Sarah Williams',
        },
        requestor: true,
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/extra-security-role-type',
              code: 'humanuser',
              display: 'Human User',
            },
          ],
        },
      },
    ],
    source: {
      observer: {
        reference: 'Practitioner/7cf5fe0a-9872-4f8e-baa1-e34d56d8a89e',
        display: 'Sarah Williams',
      },
      type: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
          code: '3',
          display: 'Web Server',
        },
      ],
    },
    entity: [
      {
        what: {
          reference: 'Patient/00285285-28df-4f9e-bebe-d64448ab2362',
        },
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
          code: '1',
          display: 'Person',
        },
        role: {
          system: 'http://terminology.hl7.org/CodeSystem/object-role',
          code: '1',
          display: 'Patient',
        },
      },
    ],
  };

  try {
    const result = await medplum.createResource(auditEvent);
    console.log('SUCCESS: created AuditEvent', result.id);
  } catch (err) {
    console.error('FAILED:', normalizeErrorString(err));
  }
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
