import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEDICAID_IDENTIFIER_SYSTEM,
  authorizeNevadaRequest,
  getConsentStatus,
} from './nevada-consent-authorization.mjs';

const practitionerReference = 'Practitioner/provider-1';
const patient = { resourceType: 'Patient', id: 'patient-1' };
const consent = (status) => ({
  resourceType: 'Consent',
  category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0' }], text: status }],
  provision: { type: status === 'opt-in' ? 'permit' : 'deny' },
});
const breakGlass = (expiresAt, provider = practitionerReference) => ({
  resourceType: 'AuditEvent',
  subtype: [{ code: 'emergency-access' }],
  agent: [{ requestor: true, who: { reference: provider } }],
  extension: [{
    url: 'https://hiivehealth.com/fhir/StructureDefinition/break-glass-expiration',
    valueDateTime: expiresAt,
  }],
});

const request = (overrides = {}) => ({
  practitionerReference,
  patient,
  consent: consent('not-declared'),
  resourceType: 'Condition',
  ...overrides,
});

test('allows clinical access for opt-in consent', () => {
  assert.equal(authorizeNevadaRequest(request({ consent: consent('opt-in') })).code, 'consent-permit');
});

test('denies clinical access for not-declared consent without Break Glass', () => {
  assert.equal(authorizeNevadaRequest(request()).allowed, false);
});

test('allows valid Break Glass for the matching practitioner', () => {
  const result = authorizeNevadaRequest(request({
    breakGlassAudit: breakGlass('2026-08-27T14:00:00.000Z'),
    now: new Date('2026-08-27T13:00:00.000Z'),
  }));
  assert.equal(result.code, 'break-glass-permit');
});

test('denies expired or mismatched Break Glass', () => {
  assert.equal(authorizeNevadaRequest(request({
    breakGlassAudit: breakGlass('2026-08-27T12:00:00.000Z'),
    now: new Date('2026-08-27T13:00:00.000Z'),
  })).allowed, false);
  assert.equal(authorizeNevadaRequest(request({
    breakGlassAudit: breakGlass('2026-08-27T14:00:00.000Z', 'Practitioner/other'),
    now: new Date('2026-08-27T13:00:00.000Z'),
  })).allowed, false);
});

test('allows opt-out Medicaid exception', () => {
  const medicaidPatient = {
    ...patient,
    identifier: [{ system: MEDICAID_IDENTIFIER_SYSTEM, value: 'member-1' }],
  };
  assert.equal(authorizeNevadaRequest(request({ patient: medicaidPatient, consent: consent('opt-out') })).code, 'medicaid-exception');
});

test('denies provider writes', () => {
  assert.equal(authorizeNevadaRequest(request({ interaction: 'update', consent: consent('opt-in') })).allowed, false);
});

test('normalizes missing consent to not-declared', () => {
  assert.equal(getConsentStatus(undefined), 'not-declared');
});
