export const NEVADA_CONSENT_SYSTEM = 'http://loinc.org';
export const NEVADA_CONSENT_CODE = '59284-0';
export const MEDICAID_IDENTIFIER_SYSTEM = 'https://hiivecare.example/fhir/Identifier/medicaid-member';
export const BREAK_GLASS_SUBTYPE = 'emergency-access';

const CLINICAL_RESOURCE_TYPES = new Set([
  'AllergyIntolerance',
  'Condition',
  'DiagnosticReport',
  'DocumentReference',
  'Encounter',
  'Immunization',
  'MedicationRequest',
  'Observation',
  'Procedure',
  'ServiceRequest',
]);

export function getConsentStatus(consent) {
  const category = consent?.category?.find((item) =>
    item.coding?.some((coding) => coding.system === NEVADA_CONSENT_SYSTEM && coding.code === NEVADA_CONSENT_CODE)
  );
  const status = category?.text?.toLowerCase();
  if (status === 'opt-in' || status === 'opt-out' || status === 'not-declared') {
    return status;
  }
  if (consent?.provision?.type === 'permit') {
    return 'opt-in';
  }
  if (consent?.provision?.type === 'deny') {
    return 'opt-out';
  }
  return 'not-declared';
}

export function isMedicaidPatient(patient) {
  return patient?.identifier?.some((identifier) => identifier.system === MEDICAID_IDENTIFIER_SYSTEM) ?? false;
}

export function getBreakGlassExpiry(auditEvent, now = new Date()) {
  if (!auditEvent || auditEvent.subtype?.some((coding) => coding.code === BREAK_GLASS_SUBTYPE) !== true) {
    return undefined;
  }
  const expiration = auditEvent.extension?.find(
    (extension) => extension.url === 'https://hiivehealth.com/fhir/StructureDefinition/break-glass-expiration'
  )?.valueDateTime;
  if (!expiration || Date.parse(expiration) <= now.getTime()) {
    return undefined;
  }
  return expiration;
}

export function authorizeNevadaRequest({
  practitionerReference,
  patient,
  consent,
  breakGlassAudit,
  resourceType,
  interaction = 'read',
  now = new Date(),
}) {
  if (!practitionerReference?.startsWith('Practitioner/')) {
    return { allowed: false, code: 'missing-practitioner', reason: 'Authenticated practitioner is required.' };
  }
  if (interaction !== 'read' && interaction !== 'search' && interaction !== 'vread' && interaction !== 'history') {
    return { allowed: false, code: 'interaction-denied', reason: 'This provider policy permits read-only clinical access.' };
  }
  if (!patient?.id && CLINICAL_RESOURCE_TYPES.has(resourceType)) {
    return { allowed: false, code: 'patient-context-required', reason: 'Patient context is required for clinical access.' };
  }
  if (!CLINICAL_RESOURCE_TYPES.has(resourceType)) {
    return { allowed: true, code: 'non-clinical-resource' };
  }

  const consentStatus = getConsentStatus(consent);
  if (consentStatus === 'opt-in') {
    return { allowed: true, code: 'consent-permit', consentStatus };
  }
  if (consentStatus === 'opt-out' && isMedicaidPatient(patient)) {
    return { allowed: true, code: 'medicaid-exception', consentStatus };
  }

  const auditProvider = breakGlassAudit?.agent?.find((agent) => agent.requestor !== false)?.who?.reference;
  const expiresAt = getBreakGlassExpiry(breakGlassAudit, now);
  if (consentStatus === 'not-declared' && auditProvider === practitionerReference && expiresAt) {
    return { allowed: true, code: 'break-glass-permit', consentStatus, expiresAt };
  }

  return { allowed: false, code: 'consent-denied', reason: 'Clinical access is not permitted for the current consent state.', consentStatus };
}
