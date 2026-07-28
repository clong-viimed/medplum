#!/usr/bin/env node
import { ClientStorage, MedplumClient, MemoryStorage, createReference, normalizeErrorString } from '@medplum/core';
import { TextDecoder, TextEncoder } from 'node:util';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const baseUrl = 'https://api.ehr.hiivehealth.net/';
const UBIX_PROJECT_ID = '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
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

  const patient = await medplum.readResource('Patient', patientId);
  const account = patient.meta?.account;
  const accounts = patient.meta?.accounts;
  console.log(`Importing C-CDA for ${patient.name?.[0]?.given?.[0]} ${patient.name?.[0]?.family} (${patientId})`);
  console.log('Patient account:', JSON.stringify(account));

  const xml = readFileSync(xmlPath, 'utf-8');

  const patientRef = createReference(patient);

  // Extract values using simple regex helpers
  const encounterTimeLow = getAttr(xml, 'Encounters', 'effectiveTime', 'low', 'value');
  const encounterCode = getAttr(xml, 'Encounters', 'encounter', 'code', 'code');
  const encounterDisplay = getAttr(xml, 'Encounters', 'encounter', 'code', 'displayName');

  const encounterId = randomUUID();
  const encounter = {
    resourceType: 'Encounter',
    id: encounterId,
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: encounterCode
      ? [{ coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: encounterCode, display: encounterDisplay ?? 'Office Visit' }] }]
      : undefined,
    subject: patientRef,
    period: encounterTimeLow
      ? {
          start: formatCcdaDateTime(encounterTimeLow),
          end: formatCcdaDateTime(encounterTimeLow.replace('110000', '113000')),
        }
      : undefined,
    meta: buildMeta(account, accounts),
  };

  const problemCode = getAttr(xml, 'Problems', 'observation', 'value', 'code');
  const problemDisplay = getAttr(xml, 'Problems', 'observation', 'value', 'displayName');
  const problemOnset = getAttr(xml, 'Problems', 'effectiveTime', 'low', 'value');

  const condition = {
    resourceType: 'Condition',
    id: randomUUID(),
    subject: patientRef,
    code: problemCode
      ? { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: problemCode, display: problemDisplay ?? 'Problem' }] }
      : undefined,
    onsetDateTime: problemOnset ? formatCcdaDate(problemOnset) : undefined,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
    meta: buildMeta(account, accounts),
  };

  const resultCode = getAttr(xml, 'Results', 'observation', 'code', 'code');
  const resultDisplay = getAttr(xml, 'Results', 'observation', 'code', 'displayName');
  const resultValue = getAttr(xml, 'Results', 'observation', 'value', 'value');
  const resultUnit = getAttr(xml, 'Results', 'observation', 'value', 'unit');

  const observation = {
    resourceType: 'Observation',
    id: randomUUID(),
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: resultCode
      ? { coding: [{ system: 'http://loinc.org', code: resultCode, display: resultDisplay ?? 'Result' }] }
      : undefined,
    subject: patientRef,
    effectiveDateTime: encounterTimeLow ? formatCcdaDateTime(encounterTimeLow) : undefined,
    valueQuantity: resultValue ? { value: Number(resultValue), unit: resultUnit } : undefined,
    meta: buildMeta(account, accounts),
  };

  // DocumentReference for the C-CDA
  const documentReference = {
    resourceType: 'DocumentReference',
    id: randomUUID(),
    status: 'current',
    type: { coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summarization of episode note' }] },
    subject: patientRef,
    content: [
      {
        attachment: {
          contentType: 'application/xml',
          data: Buffer.from(xml).toString('base64'),
          title: 'Nevada Demo C-CDA',
        },
      },
    ],
    context: {
      encounter: [{ reference: `Encounter/${encounterId}` }],
      period: encounter.period,
    },
    meta: buildMeta(account, accounts),
  };

  const entries = [encounter, condition, observation, documentReference]
    .filter((r) => hasUsefulData(r))
    .map((r) => ({
      request: { method: 'POST', url: r.resourceType },
      resource: r,
    }));

  const response = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  });

  console.log(`Imported ${response.entry?.length ?? 0} resources:`);
  for (const entry of response.entry ?? []) {
    const loc = entry.response?.location ?? '';
    console.log(`  - ${loc} (${entry.response?.status})`);
  }
}

function buildMeta(account, accounts) {
  const meta = { project: UBIX_PROJECT_ID };
  if (account) meta.account = account;
  if (accounts) meta.accounts = accounts;
  return meta;
}

function hasUsefulData(resource) {
  if (resource.resourceType === 'Condition') return !!resource.code;
  if (resource.resourceType === 'Observation') return !!resource.code || !!resource.valueQuantity;
  if (resource.resourceType === 'Encounter') return true;
  if (resource.resourceType === 'DocumentReference') return true;
  return true;
}

function formatCcdaDate(value) {
  if (!value) return undefined;
  // 20200115 -> 2020-01-15
  if (value.length === 8) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return formatCcdaDateTime(value);
}

function getAttr(xml, sectionTitle, parentTag, childTag, attr) {
  // Find the section by title, then find parentTag and extract attr from childTag
  const sectionRegex = new RegExp(`<title>${sectionTitle}</title>[\\s\\S]*?</section>`);
  const sectionMatch = xml.match(sectionRegex);
  if (!sectionMatch) return undefined;
  const section = sectionMatch[0];

  if (childTag) {
    const regex = new RegExp(`<${childTag}[^>]*\\b${attr}="([^"]*)"`);
    const match = section.match(regex);
    return match ? match[1] : undefined;
  }
  const regex = new RegExp(`<${parentTag}[^>]*\\b${attr}="([^"]*)"`);
  const match = section.match(regex);
  return match ? match[1] : undefined;
}

function formatCcdaDateTime(value) {
  if (!value) return undefined;
  // 20260728110000+0000 -> 2026-07-28T11:00:00+00:00
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-]\d{4})$/);
  if (match) {
    const [, y, mo, d, h, mi, s, tz] = match;
    const tzFormatted = `${tz.slice(0, 3)}:${tz.slice(3)}`;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${tzFormatted}`;
  }
  if (value.length === 8) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

main().catch((err) => {
  console.error(normalizeErrorString(err));
  process.exitCode = 1;
});
