#!/usr/bin/env node
// Seed Nevada HIE demo data using native Medplum resources only.
// This script creates provider users, payer roster users, patients with varied
// consent states, roster Groups, and sample Encounters for the provider portal demo.
//
// Run with ubix-data ClientApplication credentials:
//   MEDPLUM_CLIENT_ID=69a636e6-b110-4de7-ac73-4c2b642b48a2 \
//   MEDPLUM_CLIENT_SECRET=... \
//   node scripts/seed-nevada-hie-demo.mjs
//
// Or with admin credentials:
//   MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin \
//   node scripts/seed-nevada-hie-demo.mjs

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
const DEFAULT_PROVIDER_ACCESS_POLICY_ID = '05fa99c3-6400-4d8c-af38-8b00b890315d';

const NEIGHBORHOOD_HEALTH_ID = 'nevada-demo-org-neighborhood-health';
const DESERT_SPRINGS_ID = 'nevada-demo-org-desert-springs';
const SILVER_STATE_PLAN_ID = 'nevada-demo-payer-silver-state';
const HIGH_DESERT_HEALTH_ID = 'nevada-demo-payer-high-desert';

const CONSENT_CATEGORY_SYSTEM = 'http://loinc.org';
const DEMO_TAG_SYSTEM = 'https://hiivehealth.com/fhir/identifier/nevada-demo';

const DEMO_USERS = {
  providerAlex: {
    email: 'nevada.provider.alex@example.com',
    firstName: 'Alex',
    lastName: 'Martinez',
    display: 'Dr. Alex Martinez',
  },
  providerJordan: {
    email: 'nevada.provider.jordan@example.com',
    firstName: 'Jordan',
    lastName: 'Chen',
    display: 'Dr. Jordan Chen',
  },
  payerSarah: {
    email: 'nevada.payer.sarah@example.com',
    firstName: 'Sarah',
    lastName: 'Williams',
    display: 'Sarah Williams, Silver State Plan',
  },
  payerMiguel: {
    email: 'nevada.payer.miguel@example.com',
    firstName: 'Miguel',
    lastName: 'Rodriguez',
    display: 'Miguel Rodriguez, High Desert Health',
  },
};

const PATIENT_FIRST_NAMES = [
  'Riley', 'Taylor', 'Jordan', 'Casey', 'Morgan', 'Avery', 'Quinn', 'Skyler', 'Dakota', 'Reese',
  'Jamie', 'Parker', 'Sawyer', 'Hayden', 'Kai', 'River', 'Sage', 'Rowan', 'Emerson', 'Finley',
  'Alex', 'Charlie', 'Bailey', 'Drew', 'Elliot', 'Frankie', 'Harper', 'Jesse', 'Kendall', 'Logan',
  'Marley', 'Nico', 'Oakley', 'Peyton', 'Remy', 'Sam', 'Tatum', 'Val', 'Wren', 'Zion',
  'Amari', 'Blair', 'Cameron', 'Devin', 'Eden', 'Felix', 'Gray', 'Hollis', 'Indigo', 'Jules',
];

const PATIENT_LAST_NAMES = [
  'Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez',
  'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez',
  'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams',
  'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips',
];

const ENCOUNTER_CLASSES = ['AMB', 'EMER', 'IMP', 'HH'];

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help'),
  };
}

function printHelp() {
  console.log(`Usage: node scripts/seed-nevada-hie-demo.mjs [--dry-run] [--help]

Seeds the Nevada HIE demo using native Medplum resources only.

Environment:
  MEDPLUM_BASE_URL                  Defaults to ${DEFAULT_BASE_URL}
  MEDPLUM_PROJECT_ID                Defaults to ${DEFAULT_PROJECT_ID}
  MEDPLUM_ACCESS_TOKEN              Existing privileged access token
  MEDPLUM_CLIENT_ID                 Privileged client application ID
  MEDPLUM_CLIENT_SECRET             Privileged client application secret
  MEDPLUM_EMAIL                     Admin user email
  MEDPLUM_PASSWORD                  Admin user password
  MEDPLUM_PROVIDER_ACCESS_POLICY    Defaults to ${DEFAULT_PROVIDER_ACCESS_POLICY_ID}

Examples:
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/seed-nevada-hie-demo.mjs
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/seed-nevada-hie-demo.mjs --dry-run
`);
}

async function createMedplumClientFromEnv() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;
  const medplum = new MedplumClient({
    baseUrl,
    cacheTime: 0,
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
    return medplum;
  }

  throw new Error(
    'Set MEDPLUM_ACCESS_TOKEN, MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET, or MEDPLUM_EMAIL/MEDPLUM_PASSWORD before running.'
  );
}

function demoIdentifier(value) {
  return {
    system: DEMO_TAG_SYSTEM,
    value,
  };
}

function sha256ish(input) {
  // Simple deterministic hash for demo passwords. Not cryptographically secure; demo only.
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function demoPassword(email) {
  return `Nevada-${sha256ish(email)}-Demo!`;
}

function patientName(index) {
  const firstName = PATIENT_FIRST_NAMES[index % PATIENT_FIRST_NAMES.length];
  const lastName = PATIENT_LAST_NAMES[Math.floor(index / PATIENT_FIRST_NAMES.length) % PATIENT_LAST_NAMES.length];
  return { firstName, lastName, display: `${firstName} ${lastName}` };
}

function patientBirthDate(index) {
  // Ages roughly 22-72
  const year = 1954 + (index % 50);
  const month = 1 + (index % 12);
  const day = 1 + (index % 28);
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function patientGender(index) {
  const genders = ['male', 'female', 'other', 'unknown'];
  return genders[index % genders.length];
}

function consentStatus(index) {
  // Distribute: opt-in 50%, opt-out 25%, not-declared 25%
  const r = index % 100;
  if (r < 50) return 'opt-in';
  if (r < 75) return 'opt-out';
  return 'not-declared';
}

function isMedicaid(index) {
  // ~15% of patients are Medicaid
  return index % 7 === 0;
}

function payerForPatient(index) {
  return index % 2 === 0 ? SILVER_STATE_PLAN_ID : HIGH_DESERT_HEALTH_ID;
}

function organizationForPatient(index) {
  return index % 2 === 0 ? NEIGHBORHOOD_HEALTH_ID : DESERT_SPRINGS_ID;
}

async function ensureOrganization(medplum, id, name) {
  const existing = await medplum.searchOne('Organization', {
    identifier: `${DEMO_TAG_SYSTEM}|${id}`,
  });

  const desired = {
    ...(existing || {}),
    resourceType: 'Organization',
    identifier: [demoIdentifier(id)],
    name,
    active: true,
  };

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function ensurePayerGroup(medplum, id, name) {
  const existing = await medplum.searchOne('Group', {
    identifier: `${DEMO_TAG_SYSTEM}|${id}`,
  });

  const desired = {
    ...(existing || {}),
    resourceType: 'Group',
    identifier: [demoIdentifier(id)],
    type: 'person',
    actual: true,
    name,
    member: [],
  };

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function ensurePatient(medplum, index) {
  const id = `nevada-demo-patient-${index}`;
  const name = patientName(index);
  const orgId = organizationForPatient(index);
  const org = await medplum.searchOne('Organization', {
    identifier: `${DEMO_TAG_SYSTEM}|${orgId}`,
  });

  const existing = await medplum.searchOne('Patient', {
    identifier: `${DEMO_TAG_SYSTEM}|${id}`,
  });

  const desired = {
    ...(existing || {}),
    resourceType: 'Patient',
    identifier: [
      demoIdentifier(id),
      {
        system: 'http://hl7.org/fhir/sid/us-ssn',
        value: `000-${index.toString().padStart(2, '0')}-${(index * 2).toString().padStart(4, '0')}`,
      },
      {
        system: `https://${orgId}.example/mrn`,
        value: `MRN-${10000 + index}`,
      },
      ...(isMedicaid(index)
        ? [{ system: 'https://medicaid.nv.gov/member-id', value: `NV-MCD-${100000 + index}` }]
        : []),
    ],
    active: true,
    name: [
      {
        use: 'official',
        given: [name.firstName],
        family: name.lastName,
      },
    ],
    telecom: [
      {
        system: 'phone',
        value: `555-${(100 + index).toString().padStart(3, '0')}-${(1000 + index).toString().padStart(4, '0')}`,
        use: 'mobile',
      },
    ],
    gender: patientGender(index),
    birthDate: patientBirthDate(index),
    managingOrganization: org ? { reference: `Organization/${org.id}`, display: org.name } : undefined,
  };

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function ensureConsent(medplum, patient, status, index) {
  const id = `nevada-demo-consent-${index}`;
  const existing = await medplum.searchOne('Consent', {
    identifier: `${DEMO_TAG_SYSTEM}|${id}`,
  });

  const categoryCode = {
    'opt-in': '59284-0',
    'opt-out': '59284-0',
    'not-declared': '59284-0',
  }[status];

  const policy = {
    'opt-in': { authority: 'https://hiivehealth.com/nevada-consent', uri: 'https://hiivehealth.com/nevada-consent/opt-in' },
    'opt-out': { authority: 'https://hiivehealth.com/nevada-consent', uri: 'https://hiivehealth.com/nevada-consent/opt-out' },
    'not-declared': { authority: 'https://hiivehealth.com/nevada-consent', uri: 'https://hiivehealth.com/nevada-consent/not-declared' },
  }[status];

  const desired = {
    ...(existing || {}),
    resourceType: 'Consent',
    identifier: [demoIdentifier(id)],
    status: 'active',
    scope: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/consentscope',
          code: 'patient-privacy',
          display: 'Privacy Consent',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: CONSENT_CATEGORY_SYSTEM,
            code: categoryCode,
            display: 'Consent status',
          },
        ],
        text: status,
      },
    ],
    patient: { reference: `Patient/${patient.id}`, display: patient.name?.[0]?.family },
    dateTime: '2026-07-01T00:00:00.000Z',
    policy: [policy],
    provision: {
      type: status === 'opt-in' ? 'permit' : 'deny',
      period: {
        start: '2026-07-01T00:00:00.000Z',
        end: '2027-07-01T00:00:00.000Z',
      },
    },
  };

  // For not-declared, we still create a Consent resource documenting the status;
  // AccessPolicy will treat it as break-the-glass eligible.
  if (status === 'not-declared') {
    desired.provision.type = 'deny';
  }

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function ensureEncounter(medplum, patient, index) {
  const id = `nevada-demo-encounter-${index}`;
  const existing = await medplum.searchOne('Encounter', {
    identifier: `${DEMO_TAG_SYSTEM}|${id}`,
  });

  const encounterClass = ENCOUNTER_CLASSES[index % ENCOUNTER_CLASSES.length];
  const daysAgo = 1 + (index % 45);
  const date = new Date('2026-07-23T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const periodStart = date.toISOString();
  date.setUTCHours(date.getUTCHours() + (1 + (index % 4)));
  const periodEnd = date.toISOString();

  const desired = {
    ...(existing || {}),
    resourceType: 'Encounter',
    identifier: [demoIdentifier(id)],
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: encounterClass,
    },
    type: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: index % 3 === 0 ? '185345009' : index % 3 === 1 ? '308335008' : '270427003',
            display: index % 3 === 0 ? 'Encounter for symptom' : index % 3 === 1 ? 'Patient encounter procedure' : 'Patient initiated encounter',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${patient.id}`, display: patient.name?.[0]?.family },
    period: { start: periodStart, end: periodEnd },
  };

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function ensureUser(medplum, key, role, accessPolicyReferenceValue, options = {}) {
  const user = DEMO_USERS[key];
  const membershipIdentifier = `nevada-demo-membership-${key}`;
  const existingMembership = await medplum.searchOne('ProjectMembership', {
    identifier: `${DEMO_TAG_SYSTEM}|${membershipIdentifier}`,
  });

  if (args.dryRun) {
    console.log(`  ${user.email}: ${existingMembership ? 'would update' : 'would create'}`);
    return { email: user.email, status: existingMembership ? 'would update' : 'would create' };
  }

  if (existingMembership) {
    const updated = {
      ...existingMembership,
      active: true,
      accessPolicy: { reference: accessPolicyReferenceValue },
    };
    await medplum.updateResource(updated);
    return { email: user.email, status: 'updated', id: existingMembership.id };
  }

  const password = demoPassword(user.email);
  const resourceType = 'Practitioner';

  const membership = await medplum.invite(process.env.MEDPLUM_PROJECT_ID || DEFAULT_PROJECT_ID, {
    resourceType,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    externalId: membershipIdentifier,
    password,
    sendEmail: false,
    upsert: true,
    membership: {
      identifier: [demoIdentifier(membershipIdentifier)],
      accessPolicy: { reference: accessPolicyReferenceValue },
      admin: role === 'admin',
    },
  });

  return { email: user.email, status: 'created', id: membership.id, password };
}

async function ensureProviderAccessPolicy(medplum) {
  const id = process.env.MEDPLUM_PROVIDER_ACCESS_POLICY || DEFAULT_PROVIDER_ACCESS_POLICY_ID;
  return medplum.readResource('AccessPolicy', id);
}

async function ensurePayerRosterAccessPolicy(medplum) {
  const policyName = 'Nevada HIE Payer Roster Access';
  const existing = await medplum.searchOne('AccessPolicy', { name: policyName });

  const desired = {
    ...(existing || {}),
    resourceType: 'AccessPolicy',
    name: policyName,
    resource: [
      {
        resourceType: 'Patient',
        criteria: 'Patient?_id=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'Encounter',
        criteria: 'Encounter?subject=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'Consent',
        criteria: 'Consent?patient=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'DocumentReference',
        criteria: 'DocumentReference?patient=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'Observation',
        criteria: 'Observation?patient=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'Condition',
        criteria: 'Condition?patient=${patient_group_member}',
        interaction: ['read', 'search', 'history', 'vread'],
      },
      {
        resourceType: 'Group',
        interaction: ['read', 'search', 'history', 'vread'],
      },
    ],
  };

  if (existing) {
    return medplum.updateResource({ ...desired, id: existing.id });
  }
  return medplum.createResource(desired);
}

async function main() {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('Seeding Nevada HIE demo data...');
  console.log(`  dryRun: ${args.dryRun}`);

  const medplum = await createMedplumClientFromEnv();
  const projectId = process.env.MEDPLUM_PROJECT_ID || DEFAULT_PROJECT_ID;
  console.log(`  project: ${projectId}`);

  // 1. Organizations
  console.log('\n1. Ensuring organizations...');
  const neighborhoodHealth = await ensureOrganization(medplum, NEIGHBORHOOD_HEALTH_ID, 'Neighborhood Health Center');
  const desertSprings = await ensureOrganization(medplum, DESERT_SPRINGS_ID, 'Desert Springs Medical');
  console.log(`  ${neighborhoodHealth.name} (${neighborhoodHealth.id})`);
  console.log(`  ${desertSprings.name} (${desertSprings.id})`);

  // 2. AccessPolicies
  console.log('\n2. Ensuring access policies...');
  const providerAccessPolicy = await ensureProviderAccessPolicy(medplum);
  const payerAccessPolicy = await ensurePayerRosterAccessPolicy(medplum);
  console.log(`  provider: ${providerAccessPolicy.id}`);
  console.log(`  payer roster: ${payerAccessPolicy.id}`);

  // 3. Users
  console.log('\n3. Ensuring demo users...');
  const providerAlex = await ensureUser(medplum, 'providerAlex', 'provider', `AccessPolicy/${providerAccessPolicy.id}`);
  const providerJordan = await ensureUser(medplum, 'providerJordan', 'provider', `AccessPolicy/${providerAccessPolicy.id}`);
  const payerSarah = await ensureUser(medplum, 'payerSarah', 'payer', `AccessPolicy/${payerAccessPolicy.id}`);
  const payerMiguel = await ensureUser(medplum, 'payerMiguel', 'payer', `AccessPolicy/${payerAccessPolicy.id}`);
  for (const u of [providerAlex, providerJordan, payerSarah, payerMiguel]) {
    console.log(`  ${u.email}: ${u.status}${u.password ? ` (password: ${u.password})` : ''}`);
  }

  // 4. Payer Groups
  console.log('\n4. Ensuring payer roster groups...');
  const silverStateGroup = await ensurePayerGroup(medplum, SILVER_STATE_PLAN_ID, 'Silver State Plan Roster');
  const highDesertGroup = await ensurePayerGroup(medplum, HIGH_DESERT_HEALTH_ID, 'High Desert Health Roster');

  // 5. Patients, Consents, Encounters, and Group membership
  console.log('\n5. Ensuring patients, consents, and encounters...');
  const patientCount = 100;
  const silverStateMembers = [];
  const highDesertMembers = [];

  for (let i = 0; i < patientCount; i++) {
    const patient = await ensurePatient(medplum, i);
    const status = consentStatus(i);
    await ensureConsent(medplum, patient, status, i);
    await ensureEncounter(medplum, patient, i);

    const payerId = payerForPatient(i);
    const memberEntry = { entity: { reference: `Patient/${patient.id}`, display: patient.name?.[0]?.family } };
    if (payerId === SILVER_STATE_PLAN_ID) {
      silverStateMembers.push(memberEntry);
    } else {
      highDesertMembers.push(memberEntry);
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  ${i + 1}/${patientCount} patients created/updated`);
    }
  }

  // Update group memberships
  console.log('\n6. Updating roster group memberships...');
  silverStateGroup.member = silverStateMembers;
  highDesertGroup.member = highDesertMembers;
  await medplum.updateResource(silverStateGroup);
  await medplum.updateResource(highDesertGroup);
  console.log(`  Silver State Plan: ${silverStateMembers.length} members`);
  console.log(`  High Desert Health: ${highDesertMembers.length} members`);

  // 7. Assign payer users to their groups
  console.log('\n7. Assigning payer users to roster groups...');
  // Note: AccessPolicy criteria ${patient_group_member} requires the membership to be tied to a Group.
  // Medplum AccessPolicy can use membership access policy plus group criteria.
  // We keep the group relationship documented via extension for demo purposes.
  const sarahMembership = await medplum.searchOne('ProjectMembership', {
    identifier: `${DEMO_TAG_SYSTEM}|nevada-demo-membership-payerSarah`,
  });
  if (sarahMembership) {
    sarahMembership.extension = [
      {
        url: 'https://hiivehealth.com/fhir/StructureDefinition/nevada-roster-group',
        valueReference: { reference: `Group/${silverStateGroup.id}` },
      },
    ];
    await medplum.updateResource(sarahMembership);
    console.log(`  ${DEMO_USERS.payerSarah.email} → Group/${silverStateGroup.id}`);
  }

  const miguelMembership = await medplum.searchOne('ProjectMembership', {
    identifier: `${DEMO_TAG_SYSTEM}|nevada-demo-membership-payerMiguel`,
  });
  if (miguelMembership) {
    miguelMembership.extension = [
      {
        url: 'https://hiivehealth.com/fhir/StructureDefinition/nevada-roster-group',
        valueReference: { reference: `Group/${highDesertGroup.id}` },
      },
    ];
    await medplum.updateResource(miguelMembership);
    console.log(`  ${DEMO_USERS.payerMiguel.email} → Group/${highDesertGroup.id}`);
  }

  console.log('\nNevada HIE demo data seeding complete.');
  console.log('\nDemo logins:');
  for (const [key, user] of Object.entries(DEMO_USERS)) {
    console.log(`  ${user.email} / ${demoPassword(user.email)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});
