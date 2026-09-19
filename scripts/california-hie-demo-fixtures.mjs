export const CALIFORNIA_DEMO_TAG_SYSTEM = 'https://hiivehealth.com/fhir/identifier/california-hie-demo';

function hashSegment(value, seed) {
  let hash = seed;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicResourceId(value) {
  const first = hashSegment(value, 2166136261);
  const second = hashSegment(value, 2166136261 ^ 0x9e3779b9);
  const third = hashSegment(value, 2166136261 ^ 0x85ebca6b);
  const fourth = hashSegment(value, 2166136261 ^ 0xc2b2ae35);
  return `${first}-${second.slice(0, 4)}-5${second.slice(1, 4)}-a${third.slice(1, 4)}-${third}${fourth.slice(0, 4)}`;
}

function normalizeResourceIds(resources) {
  const referenceMap = new Map(
    resources.map((resource) => [`${resource.resourceType}/${resource.id}`, `${resource.resourceType}/${deterministicResourceId(resource.id)}`])
  );
  const normalize = (value) => {
    if (typeof value === 'string') {
      const reference = referenceMap.get(value);
      if (reference) {
        return reference;
      }
      return value.replace(/Organization\/(california-demo-org-[a-z-]+)/g, (_, id) => `Organization/${deterministicResourceId(id)}`);
    }
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalize(nestedValue)]));
    }
    return value;
  };
  return resources.map((resource) => ({ ...normalize(resource), id: deterministicResourceId(resource.id) }));
}

export const CALIFORNIA_SOURCE_ORGANIZATIONS = [
  { id: 'california-demo-org-bay-care', name: 'Bay Care Network', city: 'Oakland' },
  { id: 'california-demo-org-central-valley', name: 'Central Valley Community Health', city: 'Fresno' },
  { id: 'california-demo-org-sierra-wellness', name: 'Sierra Wellness Medical Group', city: 'Sacramento' },
];

export const CALIFORNIA_DEMO_PATIENTS = [
  ['maya-chen', 'Maya', 'Chen', '1982-04-18', ['california-demo-org-bay-care', 'california-demo-org-central-valley', 'california-demo-org-sierra-wellness'], 'longitudinal'],
  ['elena-ramirez', 'Elena', 'Ramirez', '1971-09-22', ['california-demo-org-bay-care'], 'critical-alert'],
  ['marcus-johnson', 'Marcus', 'Johnson', '1965-01-14', ['california-demo-org-central-valley'], 'care-program'],
  ['aisha-patel', 'Aisha', 'Patel', '1990-11-03', ['california-demo-org-sierra-wellness'], 'sdoh'],
  ['daniel-kim', 'Daniel', 'Kim', '1958-06-30', ['california-demo-org-bay-care'], 'document'],
  ['sophia-martinez', 'Sophia', 'Martinez', '1988-02-09', ['california-demo-org-central-valley'], 'population'],
  ['noah-williams', 'Noah', 'Williams', '1976-07-26', ['california-demo-org-sierra-wellness'], 'population'],
  ['olivia-davis', 'Olivia', 'Davis', '1969-03-17', ['california-demo-org-bay-care'], 'population'],
  ['ethan-brown', 'Ethan', 'Brown', '1984-12-05', ['california-demo-org-central-valley'], 'population'],
  ['isabella-garcia', 'Isabella', 'Garcia', '1979-08-11', ['california-demo-org-sierra-wellness'], 'population'],
  ['liam-nguyen', 'Liam', 'Nguyen', '1993-05-28', ['california-demo-org-bay-care'], 'population'],
  ['zoe-thompson', 'Zoe', 'Thompson', '1962-10-19', ['california-demo-org-central-valley'], 'population'],
].map(([id, given, family, birthDate, sources, scenario]) => ({ id, given, family, birthDate, sources, scenario }));

export function buildCaliforniaDemoFoundation() {
  const organizations = CALIFORNIA_SOURCE_ORGANIZATIONS.map((organization) => ({
    resourceType: 'Organization',
    id: organization.id,
    name: organization.name,
    address: [{ city: organization.city, state: 'CA', country: 'US' }],
    identifier: [{ system: CALIFORNIA_DEMO_TAG_SYSTEM, value: organization.id }],
  }));

  const patients = CALIFORNIA_DEMO_PATIENTS.map((patient) => ({
    resourceType: 'Patient',
    id: `california-demo-patient-${patient.id}`,
    name: [{ given: [patient.given], family: patient.family }],
    birthDate: patient.birthDate,
    identifier: [
      { system: CALIFORNIA_DEMO_TAG_SYSTEM, value: patient.id },
      ...patient.sources.map((source, index) => ({
        system: `https://hiivehealth.com/fhir/identifier/${source}`,
        value: `CA-${String(index + 1).padStart(2, '0')}-${patient.id.toUpperCase()}`,
        assigner: {
          reference: `Organization/${source}`,
          display: CALIFORNIA_SOURCE_ORGANIZATIONS.find((organization) => organization.id === source)?.name,
        },
      })),
    ],
    extension: [{ url: `${CALIFORNIA_DEMO_TAG_SYSTEM}/scenario`, valueCode: patient.scenario }],
  }));

  const patientReference = (id) => `Patient/california-demo-patient-${id}`;
  const sourceMetadata = (organizationId) => ({
    source: `https://hiivehealth.com/fhir/Organization/${organizationId}`,
    tag: [{ system: CALIFORNIA_DEMO_TAG_SYSTEM, code: 'synthetic' }],
  });
  const clinicalResources = [
    {
      resourceType: 'Condition',
      id: 'california-demo-condition-maya-diabetes',
      meta: sourceMetadata('california-demo-org-bay-care'),
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      code: { coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Type 2 diabetes mellitus' }] },
      subject: { reference: patientReference('maya-chen') },
    },
    {
      resourceType: 'MedicationRequest',
      id: 'california-demo-medication-maya-metformin',
      meta: sourceMetadata('california-demo-org-central-valley'),
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'metformin 500 MG Oral Tablet' }] },
      subject: { reference: patientReference('maya-chen') },
      authoredOn: '2026-08-15',
    },
    {
      resourceType: 'Observation',
      id: 'california-demo-observation-maya-a1c',
      meta: sourceMetadata('california-demo-org-sierra-wellness'),
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }] },
      subject: { reference: patientReference('maya-chen') },
      effectiveDateTime: '2026-08-22',
      valueQuantity: { value: 7.4, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    },
    ...CALIFORNIA_SOURCE_ORGANIZATIONS.map((organization, index) => ({
      resourceType: 'Encounter',
      id: `california-demo-encounter-maya-${index + 1}`,
      meta: sourceMetadata(organization.id),
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      subject: { reference: patientReference('maya-chen') },
      serviceProvider: { reference: `Organization/${organization.id}` },
      period: { start: `2026-0${index + 4}-15T09:00:00-07:00`, end: `2026-0${index + 4}-15T09:30:00-07:00` },
    })),
    {
      resourceType: 'AllergyIntolerance',
      id: 'california-demo-allergy-elena-penicillin',
      meta: sourceMetadata('california-demo-org-bay-care'),
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
      verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
      type: 'allergy',
      category: ['medication'],
      criticality: 'high',
      code: { text: 'Penicillin' },
      patient: { reference: patientReference('elena-ramirez') },
    },
    {
      resourceType: 'Observation',
      id: 'california-demo-observation-elena-potassium',
      meta: sourceMetadata('california-demo-org-bay-care'),
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' }] },
      subject: { reference: patientReference('elena-ramirez') },
      effectiveDateTime: '2026-09-10',
      valueQuantity: { value: 6.1, unit: 'mmol/L', system: 'http://unitsofmeasure.org', code: 'mmol/L' },
      interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'HH', display: 'Critical high' }] }],
    },
    {
      resourceType: 'Coverage',
      id: 'california-demo-coverage-marcus-medical',
      meta: sourceMetadata('california-demo-org-central-valley'),
      status: 'active',
      beneficiary: { reference: patientReference('marcus-johnson') },
      payor: [{ display: 'California Medi-Cal' }],
      period: { start: '2024-01-01' },
    },
    {
      resourceType: 'CarePlan',
      id: 'california-demo-careplan-marcus-calaim',
      meta: sourceMetadata('california-demo-org-central-valley'),
      status: 'active',
      intent: 'plan',
      title: 'Enhanced Care Management',
      subject: { reference: patientReference('marcus-johnson') },
      period: { start: '2026-01-01' },
    },
    {
      resourceType: 'Observation',
      id: 'california-demo-observation-aisha-housing',
      meta: sourceMetadata('california-demo-org-sierra-wellness'),
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '71802-3', display: 'Housing status' }] },
      subject: { reference: patientReference('aisha-patel') },
      effectiveDateTime: '2026-09-01',
      valueCodeableConcept: { text: 'Unstable housing' },
    },
    {
      resourceType: 'Immunization',
      id: 'california-demo-immunization-maya-influenza',
      meta: sourceMetadata('california-demo-org-sierra-wellness'),
      status: 'completed',
      vaccineCode: { coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '140', display: 'Influenza, seasonal, injectable, preservative free' }] },
      patient: { reference: patientReference('maya-chen') },
      occurrenceDateTime: '2026-09-01',
    },
    {
      resourceType: 'Procedure',
      id: 'california-demo-procedure-maya-retinal-exam',
      meta: sourceMetadata('california-demo-org-bay-care'),
      status: 'completed',
      code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '92250', display: 'Fundus photography with interpretation' }] },
      subject: { reference: patientReference('maya-chen') },
      performedDateTime: '2026-07-12',
    },
    {
      resourceType: 'DiagnosticReport',
      id: 'california-demo-report-maya-a1c',
      meta: sourceMetadata('california-demo-org-sierra-wellness'),
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel - Blood by Automated count' }] },
      subject: { reference: patientReference('maya-chen') },
      effectiveDateTime: '2026-08-22',
      result: [{ reference: 'Observation/california-demo-observation-maya-a1c' }],
    },
    {
      resourceType: 'CareTeam',
      id: 'california-demo-careteam-maya',
      meta: sourceMetadata('california-demo-org-central-valley'),
      status: 'active',
      subject: { reference: patientReference('maya-chen') },
      participant: [{ role: [{ text: 'Primary care' }], member: { display: 'California HIE Demo Care Team' } }],
    },
    {
      resourceType: 'RelatedPerson',
      id: 'california-demo-contact-maya',
      meta: sourceMetadata('california-demo-org-central-valley'),
      active: true,
      patient: { reference: patientReference('maya-chen') },
      relationship: [{ text: 'Emergency contact' }],
      name: [{ given: ['Jordan'], family: 'Chen' }],
      telecom: [{ system: 'phone', value: '555-010-2026', use: 'mobile' }],
    },
    {
      resourceType: 'Binary',
      id: 'california-demo-binary-daniel-ccda',
      meta: sourceMetadata('california-demo-org-bay-care'),
      contentType: 'application/xml',
      data: 'PENsaW5pY2FsRG9jdW1lbnQ+PERlbW8+Q2FsaWZvcm5pYSBISUU8L0RlbW8+PC9DbGluaWNhbERvY3VtZW50Pg==',
    },
    {
      resourceType: 'Binary',
      id: 'california-demo-binary-maya-discharge-pdf',
      meta: sourceMetadata('california-demo-org-central-valley'),
      contentType: 'application/pdf',
      data: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2OSA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjcyIDcyMCBUZAooQ2FsaWZvcm5pYSBISUUgZGVtbyBkaXNjaGFyZ2Ugc3VtbWFyeSkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNTkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MjkKJSVFT0YK',
    },
    {
      resourceType: 'DocumentReference',
      id: 'california-demo-document-daniel-ccda',
      meta: sourceMetadata('california-demo-org-bay-care'),
      status: 'current',
      type: { text: 'Continuity of Care Document' },
      subject: { reference: patientReference('daniel-kim') },
      date: '2026-09-05T10:00:00-07:00',
      content: [{ attachment: { contentType: 'application/xml', title: 'Daniel Kim Continuity of Care Document.xml', url: 'Binary/california-demo-binary-daniel-ccda' } }],
    },
    {
      resourceType: 'DocumentReference',
      id: 'california-demo-document-maya-discharge',
      meta: sourceMetadata('california-demo-org-central-valley'),
      status: 'current',
      type: { text: 'Discharge summary' },
      subject: { reference: patientReference('maya-chen') },
      date: '2026-06-15T10:00:00-07:00',
      content: [{ attachment: { contentType: 'application/pdf', title: 'Maya Chen discharge summary.pdf', url: 'Binary/california-demo-binary-maya-discharge-pdf' } }],
    },
    {
      resourceType: 'Provenance',
      id: 'california-demo-provenance-maya-discharge',
      meta: sourceMetadata('california-demo-org-central-valley'),
      target: [{ reference: 'DocumentReference/california-demo-document-maya-discharge' }],
      recorded: '2026-06-15T10:00:00-07:00',
      agent: [{ who: { reference: 'Organization/california-demo-org-central-valley', display: 'Central Valley Community Health' } }],
    },
    {
      resourceType: 'AuditEvent',
      id: 'california-demo-audit-foundation',
      meta: sourceMetadata('california-demo-org-bay-care'),
      type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'Restful Operation' },
      action: 'R',
      recorded: '2026-09-01T09:00:00-07:00',
      outcome: '0',
      agent: [{ who: { display: 'California HIE Demo Clinician' }, requestor: true }],
      source: { observer: { display: 'HiiveCare California Viewer Demo' } },
      entity: [{ what: { reference: patientReference('maya-chen') }, description: 'Synthetic longitudinal record review' }],
    },
  ];

  return normalizeResourceIds([...organizations, ...patients, ...clinicalResources]);
}

export function validateCaliforniaDemoFoundation(resources) {
  const resourceList = resources;
  const organizationIds = new Set(
    resourceList.filter((resource) => resource.resourceType === 'Organization').map((resource) => resource.id)
  );
  const patientIds = new Set(
    resourceList.filter((resource) => resource.resourceType === 'Patient').map((resource) => resource.id)
  );
  const errors = [];

  if (organizationIds.size !== 3) {
    errors.push(`Expected 3 source organizations; found ${organizationIds.size}.`);
  }
  if (patientIds.size !== 12) {
    errors.push(`Expected 12 California demo patients; found ${patientIds.size}.`);
  }
  for (const resourceType of ['Encounter', 'Condition', 'AllergyIntolerance', 'MedicationRequest', 'Observation', 'DiagnosticReport', 'Immunization', 'Procedure', 'Coverage', 'CarePlan', 'CareTeam', 'RelatedPerson', 'Binary', 'DocumentReference', 'Provenance', 'AuditEvent']) {
    if (!resourceList.some((resource) => resource.resourceType === resourceType)) {
      errors.push(`Missing required ${resourceType} fixture.`);
    }
  }
  for (const scenario of ['longitudinal', 'critical-alert', 'care-program', 'sdoh', 'document']) {
    if (!CALIFORNIA_DEMO_PATIENTS.some((patient) => patient.scenario === scenario)) {
      errors.push(`Missing required ${scenario} scenario patient.`);
    }
  }
  const documentContentTypes = new Set(
    resourceList
      .filter((resource) => resource.resourceType === 'DocumentReference')
      .flatMap((resource) => resource.content?.map((content) => content.attachment?.contentType))
  );
  if (!documentContentTypes.has('application/xml') || !documentContentTypes.has('application/pdf')) {
    errors.push('Missing required C-CDA/XML or PDF document fixture.');
  }
  return errors;
}