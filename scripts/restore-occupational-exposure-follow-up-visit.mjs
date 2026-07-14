#!/usr/bin/env node
// Restore the OccupationalExposureFollowUpVisit PlanDefinition to its original
// occupational-health actions. This script does not modify other demo resources.
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
const VISIT_CARE_TEMPLATE_URL = 'https://hiivecare.example/fhir/PlanDefinition/occupational-exposure-follow-up-visit';

const VISIT_CARE_TEMPLATE = {
  resourceType: 'PlanDefinition',
  url: VISIT_CARE_TEMPLATE_URL,
  name: 'OccupationalExposureFollowUpVisit',
  title: 'Occupational exposure follow-up visit',
  status: 'active',
  type: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/plan-definition-type',
        code: 'order-set',
        display: 'Order Set',
      },
    ],
    text: 'Order Set',
  },
  description: 'Demo care template for occupational exposure follow-up visits and return-to-work review.',
  action: [
    {
      id: 'review-incident-history',
      title: 'Review exposure incident history',
      description: 'Review the documented exposure event, encounter context, and affected work location.',
    },
    {
      id: 'assess-return-to-work-status',
      title: 'Assess return-to-work status',
      description: 'Confirm current RTW status, restrictions, and reevaluation timing.',
    },
    {
      id: 'document-follow-up-plan',
      title: 'Document follow-up plan',
      description: 'Capture next steps for clearance, restrictions, or additional occupational health follow-up.',
    },
  ],
};

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
    throw new Error('Set MEDPLUM_EMAIL and MEDPLUM_PASSWORD, or MEDPLUM_ACCESS_TOKEN');
  }

  console.log(`Restoring ${VISIT_CARE_TEMPLATE_URL} ...`);
  const templates = await medplum.searchResources(
    'PlanDefinition',
    new URLSearchParams([
      ['url', VISIT_CARE_TEMPLATE_URL],
      ['_count', '1'],
    ])
  );

  const currentTemplate = templates[0];
  const desiredTemplate = {
    ...(currentTemplate || {}),
    ...VISIT_CARE_TEMPLATE,
  };

  if (!currentTemplate) {
    const created = await medplum.createResource(desiredTemplate);
    console.log(`Created PlanDefinition/${created.id}`);
  } else {
    const updated = await medplum.updateResource(desiredTemplate);
    console.log(`Updated PlanDefinition/${updated.id}`);
  }

  console.log('Actions:');
  for (const action of desiredTemplate.action) {
    console.log(`  - ${action.title}`);
  }
}
