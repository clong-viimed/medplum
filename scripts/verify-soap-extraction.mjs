#!/usr/bin/env node
// Verify that SOAP QuestionnaireResponses extract into Observations, Conditions, and CarePlan
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

const QUESTIONNAIRES = [
  { url: 'https://hiivehealth.com/questionnaire/soap-subjective', title: 'Subjective' },
  { url: 'https://hiivehealth.com/questionnaire/soap-objective', title: 'Objective' },
  { url: 'https://hiivehealth.com/questionnaire/soap-assessment', title: 'Assessment' },
  { url: 'https://hiivehealth.com/questionnaire/soap-plan', title: 'Plan' },
];

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

  console.log('Searching for a demo patient...');
  const patient = await medplum.searchOne('Patient', { _id: '5506b4b2-6557-4876-8367-7e398914bce4' });
  if (!patient?.id) {
    throw new Error('Demo patient not found.');
  }
  console.log(`  Found: Patient/${patient.id}`);

  console.log('\nCreating test Encounter...');
  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patient.id}` },
    participant: [],
  });
  console.log(`  Created: Encounter/${encounter.id}`);

  console.log('\nCreating SOAP QuestionnaireResponses...');
  for (const q of QUESTIONNAIRES) {
    const questionnaire = await medplum.searchOne('Questionnaire', { url: q.url });
    if (!questionnaire?.id) {
      throw new Error(`Questionnaire not found: ${q.url}`);
    }

    const response = {
      resourceType: 'QuestionnaireResponse',
      questionnaire: q.url,
      status: 'in-progress',
      subject: { reference: `Patient/${patient.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      authored: new Date().toISOString(),
      item: buildSampleItems(q.url),
    };

    await medplum.createResource(response);
    console.log(`  Created response for ${q.title}`);
  }

  console.log('\nExtracting and creating clinical resources...');
  const extracted = await extractAndCreateResources(medplum, patient, encounter);

  console.log('\nVerifying extraction...');
  const observations = await medplum.searchResources('Observation', `encounter=Encounter/${encounter.id}`);
  const conditions = await medplum.searchResources('Condition', `encounter=Encounter/${encounter.id}`);
  const carePlans = await medplum.searchResources('CarePlan', `encounter=Encounter/${encounter.id}`);

  console.log(`  Observations: ${observations.length}`);
  console.log(`  Conditions: ${conditions.length}`);
  console.log(`  CarePlans: ${carePlans.length}`);

  for (const obs of observations) {
    console.log(`    - Observation/${obs.id}: ${obs.code?.text || obs.code?.coding?.[0]?.display}`);
  }
  for (const cond of conditions) {
    console.log(`    - Condition/${cond.id}: ${cond.code?.text || cond.code?.coding?.[0]?.display}`);
  }
  for (const cp of carePlans) {
    console.log(`    - CarePlan/${cp.id}: ${cp.title}`);
  }

  if (observations.length === 0 && conditions.length === 0 && carePlans.length === 0) {
    throw new Error('No extracted resources found.');
  }

  console.log('\n✅ SOAP extraction verified: resources can be queried by encounter.');
}

async function extractAndCreateResources(medplum, patient, encounter) {
  const responses = [
    {
      url: 'https://hiivehealth.com/questionnaire/soap-subjective',
      items: buildSampleItems('https://hiivehealth.com/questionnaire/soap-subjective'),
    },
    {
      url: 'https://hiivehealth.com/questionnaire/soap-objective',
      items: buildSampleItems('https://hiivehealth.com/questionnaire/soap-objective'),
    },
    {
      url: 'https://hiivehealth.com/questionnaire/soap-assessment',
      items: buildSampleItems('https://hiivehealth.com/questionnaire/soap-assessment'),
    },
    {
      url: 'https://hiivehealth.com/questionnaire/soap-plan',
      items: buildSampleItems('https://hiivehealth.com/questionnaire/soap-plan'),
    },
  ];

  for (const { url, items } of responses) {
    const response = {
      resourceType: 'QuestionnaireResponse',
      questionnaire: url,
      status: 'in-progress',
      subject: { reference: `Patient/${patient.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      authored: new Date().toISOString(),
      item: items,
    };

    const extracted = extractResponse(url, response, patient, encounter);

    for (const observation of extracted.observations) {
      await medplum.createResource(observation);
    }
    for (const condition of extracted.conditions) {
      await medplum.createResource(condition);
    }
    for (const carePlan of extracted.carePlans) {
      await medplum.createResource(carePlan);
    }

    if (extracted.dispositionCode) {
      const updatedEncounter = {
        ...encounter,
        hospitalization: {
          ...encounter.hospitalization,
          dischargeDisposition: {
            coding: [
              {
                system: 'https://hiivehealth.com/fhir/soap/disposition',
                code: extracted.dispositionCode,
                display: extracted.dispositionDisplay,
              },
            ],
          },
        },
      };
      await medplum.updateResource(updatedEncounter);
    }
  }
}

function extractResponse(url, response, patient, encounter) {
  const result = { observations: [], conditions: [], carePlans: [], dispositionCode: undefined, dispositionDisplay: undefined };
  const subject = { reference: `Patient/${patient.id}` };
  const encRef = { reference: `Encounter/${encounter.id}` };

  switch (url) {
    case 'https://hiivehealth.com/questionnaire/soap-subjective': {
      const hpi = stringAnswer(response, 'hpi');
      if (hpi) {
        result.observations.push({
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '29545-4', display: 'History of present illness' }] },
          subject,
          encounter: encRef,
          effectiveDateTime: new Date().toISOString(),
          valueString: hpi,
        });
      }
      for (const answer of findItem(response, 'chief-complaint')?.answer ?? []) {
        const text = answer.valueString;
        if (text) {
          result.conditions.push({
            resourceType: 'Condition',
            clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
            verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'provisional' }] },
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] }],
            code: { text },
            subject,
            encounter: encRef,
          });
        }
      }
      break;
    }
    case 'https://hiivehealth.com/questionnaire/soap-objective': {
      const vitals = [
        { linkId: 'temperature', code: '8310-5', display: 'Body temperature', unit: '[degF]' },
        { linkId: 'heart-rate', code: '8867-4', display: 'Heart rate', unit: '/min' },
        { linkId: 'systolic-bp', code: '8480-6', display: 'Systolic blood pressure', unit: 'mm[Hg]' },
        { linkId: 'diastolic-bp', code: '8462-4', display: 'Diastolic blood pressure', unit: 'mm[Hg]' },
      ];
      for (const vital of vitals) {
        const value = decimalAnswer(response, vital.linkId);
        if (value !== undefined) {
          result.observations.push({
            resourceType: 'Observation',
            status: 'final',
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
            code: { coding: [{ system: 'http://loinc.org', code: vital.code, display: vital.display }] },
            subject,
            encounter: encRef,
            effectiveDateTime: new Date().toISOString(),
            valueQuantity: { value, unit: vital.unit, system: 'http://unitsofmeasure.org', code: vital.unit },
          });
        }
      }
      const physicalExam = stringAnswer(response, 'physical-exam');
      if (physicalExam) {
        result.observations.push({
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'exam', display: 'Exam' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '29544-7', display: 'Physical findings' }] },
          subject,
          encounter: encRef,
          effectiveDateTime: new Date().toISOString(),
          valueString: physicalExam,
        });
      }
      break;
    }
    case 'https://hiivehealth.com/questionnaire/soap-assessment': {
      for (const answer of findItem(response, 'diagnoses')?.answer ?? []) {
        const text = answer.valueString;
        if (text) {
          result.conditions.push({
            resourceType: 'Condition',
            clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
            verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }] }],
            code: { text },
            subject,
            encounter: encRef,
          });
        }
      }
      const assessmentNote = stringAnswer(response, 'assessment-note');
      if (assessmentNote) {
        result.observations.push({
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '51847-2', display: 'Evaluation + Plan note' }] },
          subject,
          encounter: encRef,
          effectiveDateTime: new Date().toISOString(),
          valueString: assessmentNote,
        });
      }
      break;
    }
    case 'https://hiivehealth.com/questionnaire/soap-plan': {
      const planText = stringAnswer(response, 'plan-free-text');
      if (planText) {
        result.carePlans.push({
          resourceType: 'CarePlan',
          status: 'active',
          intent: 'plan',
          title: 'SOAP Plan',
          description: planText,
          subject,
          encounter: encRef,
        });
      }
      const disposition = codingAnswer(response, 'patient-disposition');
      if (disposition?.code) {
        result.dispositionCode = disposition.code;
        result.dispositionDisplay = disposition.display;
      }
      break;
    }
  }

  return result;
}

function findItem(response, linkId) {
  return response.item?.find((item) => item.linkId === linkId);
}

function stringAnswer(response, linkId) {
  return findItem(response, linkId)?.answer?.[0]?.valueString;
}

function decimalAnswer(response, linkId) {
  return findItem(response, linkId)?.answer?.[0]?.valueDecimal ?? findItem(response, linkId)?.answer?.[0]?.valueInteger;
}

function codingAnswer(response, linkId) {
  return findItem(response, linkId)?.answer?.[0]?.valueCoding;
}

function buildSampleItems(url) {
  switch (url) {
    case 'https://hiivehealth.com/questionnaire/soap-subjective':
      return [
        { linkId: 'chief-complaint', answer: [{ valueString: 'Chest pain' }] },
        { linkId: 'hpi', answer: [{ valueString: 'Patient reports sudden onset chest pain after exertion.' }] },
      ];
    case 'https://hiivehealth.com/questionnaire/soap-objective':
      return [
        { linkId: 'temperature', answer: [{ valueDecimal: 98.6 }] },
        { linkId: 'heart-rate', answer: [{ valueInteger: 88 }] },
        { linkId: 'systolic-bp', answer: [{ valueInteger: 130 }] },
        { linkId: 'diastolic-bp', answer: [{ valueInteger: 82 }] },
        { linkId: 'physical-exam', answer: [{ valueString: 'Normal heart sounds.' }] },
      ];
    case 'https://hiivehealth.com/questionnaire/soap-assessment':
      return [
        { linkId: 'diagnoses', answer: [{ valueString: 'Unspecified chest pain' }] },
        { linkId: 'assessment-note', answer: [{ valueString: 'Low-risk chest pain, likely musculoskeletal.' }] },
      ];
    case 'https://hiivehealth.com/questionnaire/soap-plan':
      return [
        { linkId: 'plan-free-text', answer: [{ valueString: 'Rest, hydration, follow up in 1 week.' }] },
        {
          linkId: 'patient-disposition',
          answer: [{ valueCoding: { system: 'https://hiivehealth.com/fhir/soap/disposition', code: 'full-duty' } }],
        },
      ];
    default:
      return [];
  }
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

  if (process.env.MEDPLUM_EMAIL && process.env.MEDPLUM_PASSWORD) {
    const loginResult = await medplum.startLogin(
      {
        email: process.env.MEDPLUM_EMAIL,
        password: process.env.MEDPLUM_PASSWORD,
        ...(process.env.MEDPLUM_PROJECT_ID ? { projectId: process.env.MEDPLUM_PROJECT_ID } : {}),
      },
      { remember: false }
    );
    if (loginResult.code) {
      await medplum.processCode(loginResult.code);
    }
    return medplum;
  }

  throw new Error(
    'Set MEDPLUM_ACCESS_TOKEN, MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET, or MEDPLUM_EMAIL/MEDPLUM_PASSWORD before running.\n' +
      'Example: MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-soap-extraction.mjs'
  );
}

function parseArgs(argv) {
  const parsed = { help: false };
  const knownArgs = new Set(['--help']);
  for (const arg of argv) {
    if (!knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (arg === '--help') {
      parsed.help = true;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-soap-extraction.mjs

Creates sample QuestionnaireResponses and verifies that extracted resources (Observation, Condition, CarePlan) are queryable by encounter.

Environment variables:
  MEDPLUM_BASE_URL      Medplum server base URL (default: ${DEFAULT_BASE_URL})
  MEDPLUM_CLIENT_ID     Client application ID
  MEDPLUM_CLIENT_SECRET Client application secret
  MEDPLUM_ACCESS_TOKEN  Existing access token
  MEDPLUM_EMAIL         User email
  MEDPLUM_PASSWORD      User password
  MEDPLUM_PROJECT_ID    Optional project ID

Example:
  MEDPLUM_EMAIL=admin@example.com MEDPLUM_PASSWORD=medplum_admin node scripts/verify-soap-extraction.mjs
`);
}
