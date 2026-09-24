# Mimicking the HiiveHealth SOAP Note in Medplum

Last updated: 2026-09-21

## Goal

Reproduce the HiiveHealth encounter-chart SOAP note shown in the four reference screenshots using as much Medplum-native tooling as possible. The screenshots show:

1. **Encounter header** — Sick Call, In Person Visit, In Progress status, provider, start time, plus Encounter Report / QR Code / Discharge Patient actions.
2. **Clinical Decision Flows** dropdown and a **checklist** of tasks (e.g., "Annotate chief complaint", "Record and document vitals").
3. **Room and Station** assignment, a **Vitals** panel (Temp, HR, Weight, Height, SpO₂, RR, BP), a **Subjective** section (History of Present Illness, Review of Systems, Complaints), and an **Objective** section.
4. **Assessment** section (Diagnosis, Differential Diagnoses, Previous Diagnoses) and a **Plan** section (Plan Free Text, Patient Disposition, Disposition End Date, Orders, Sign / Sign & Close Encounter).

## High-level architecture

Use a **FHIR `PlanDefinition` as the encounter template**. The `PlanDefinition` defines the SOAP workflow as a set of `action`s that point to **`ActivityDefinition`** resources for concrete tasks/orders.

The four SOAP sections are captured using **separate `Questionnaire` resources** rendered as cards in the Provider app. This follows Medplum's documented "happy path": `Questionnaire` is used only for data entry, and the submitted `QuestionnaireResponse`s are parsed into searchable FHIR resources (`Observation`, `ClinicalImpression`, `Condition`, `CarePlan`, `ServiceRequest`) via the `$extract` operation or a Medplum Bot.

When a provider creates an encounter from the Provider app and selects the SOAP template, the existing `createEncounter()` helper calls `PlanDefinition/$apply`. That operation instantiates the template into:

- `Task` resources (the checklist)
- `ServiceRequest` resources (orders/labs)
- `ClinicalImpression` (initial chart container)
- A `RequestGroup` linking the generated tasks and orders

The encounter chart page then renders the resulting resources with native Medplum React components.

### Option A vs. Option B

Two questionnaire architectures were considered:

- **Option A**: One master `Questionnaire` referenced by the `PlanDefinition`, containing all SOAP sections and rendered as a single form.
- **Option B**: Separate `Questionnaire` resources per SOAP section, rendered as individual cards in the chart UI and extracted independently.

This document follows **Option B**. Medplum's documented "happy path" treats `Questionnaire` as a data-capture mechanism only; after submission the answers should be extracted into proper FHIR resources. Keeping each section as its own `Questionnaire` keeps extraction mappings small, lets providers fill and sign sections independently, and matches the modular layout in the HiiveHealth screenshots.

## FHIR resource mapping

| HiiveHealth UI section | Medplum-native FHIR resource | Notes |
|------------------------|------------------------------|-------|
| Encounter header (Sick Call, In Person Visit, status, provider, date) | `Encounter` | Core visit container. `Encounter.class` = `AMB`, `EMER`, etc. `Encounter.status` drives the visit lifecycle. |
| Facility builder (building, floor, room, station) | `Location` hierarchy | No-code facility builder maps directly to nested `Location` resources: building (parent) → floor (child) → room (child) → station/bed/chair (child). |
| Room and Station | `Encounter.location` | Add the selected station `Location` reference with period to `Encounter.location`. The room is implied by the station's parent chain. |
| Vitals panel | `Observation` (LOINC-coded) | One `Observation` per vital: temp, HR, weight, height, SpO₂, RR, BP. Use standard LOINC codes. |
| Subjective — History of Present Illness | `Observation` | Patient-reported symptom. Capture via `Questionnaire`, then extract to `Observation` with `performer` = `Patient/{id}`. |
| Subjective — Review of Systems | `Observation` (one per system) | Capture via a ROS `Questionnaire`, then extract each system finding to a separate `Observation` with `performer` = `Patient/{id}`. |
| Subjective — Complaints | `Condition` (chief complaint) | `category` = `problem-list-item` or `encounter-diagnosis`. |
| Objective — Vitals / Observations | `Observation` (LOINC-coded) | Clinician/device-measured findings. Capture via a Vitals `Questionnaire` or direct form, then persist as `Observation`s with `performer` = `Practitioner/{id}` or device. |
| Objective — Physical exam free text | `Observation` or `ClinicalImpression.note` | Measured/observed exam findings. Prefer `Observation` for structured data; free text can live in `ClinicalImpression.note`. |
| Assessment — Diagnosis | `Condition` with `category` = `encounter-diagnosis` | Primary diagnoses. |
| Assessment — Differential Diagnoses | `Condition` with verificationStatus = `differential` | Use `Condition.verificationStatus`. |
| Assessment — Previous Diagnoses | `Condition` (existing patient conditions) | Search `Condition?patient=...` and link to the encounter. |
| Plan — Plan Free Text | `CarePlan.description` or `ClinicalImpression.note` | Free-text plan. |
| Plan — Patient Disposition | `Encounter.hospitalization.dischargeDisposition` | Standard HL7 discharge-disposition ValueSet. |
| Plan — Disposition End Date | `CarePlan.period.end` or extension on `Encounter` | End date for limited-duty/disposition. |
| Plan — Orders | `ServiceRequest` | Generated by `PlanDefinition/$apply` from `ActivityDefinition`s, or extracted from the Plan `QuestionnaireResponse`. |
| Sign / Sign & Close Encounter | `Provenance` | Already implemented in `EncounterChart.tsx`. `Provenance` records the signature; locking completes all open `Task`s and sets `ClinicalImpression.status` = `completed`. |
| Checklist | `Task` | Generated by `PlanDefinition/$apply`. Each checklist item is a `Task` linked to the `Encounter`. |
| Clinical Decision Flows | `Questionnaire` library + `QuestionnaireResponse` | Each decision flow is a standalone `Questionnaire` selected from a library. Responses are extracted into the appropriate clinical resources. |
| Final SOAP document | `Composition` | Optional: after signing, assemble a `Composition` with four sections (Subjective, Objective, Assessment, Plan) referencing the resources above. |

## Implementation steps

### Step 1 — Create the SOAP encounter template (`PlanDefinition`)

Create one `PlanDefinition` named "HiiveHealth SOAP Visit" in Medplum Admin at `/PlanDefinition/new`. Use `type` = `order-set` and `status` = `active`.

Its `action` array defines the **checklist only** (tasks and orders). It does not reference the SOAP capture questionnaires, because those are rendered directly in the chart UI.

```json
{
  "resourceType": "PlanDefinition",
  "name": "HiiveHealthSOAPVisit",
  "title": "HiiveHealth SOAP Visit",
  "status": "active",
  "type": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/plan-definition-type",
      "code": "order-set",
      "display": "Order Set"
    }]
  },
  "action": [
    {
      "id": "chief-complaint",
      "title": "Annotate chief complaint",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/chief-complaint-task"
    },
    {
      "id": "vitals",
      "title": "Record and document vitals, height, weight",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/vitals-task"
    },
    {
      "id": "hpi-ros",
      "title": "Complete HPI and ROS",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/hpi-ros-task"
    },
    {
      "id": "physical-exam",
      "title": "Conduct PE, assessment/diagnosis and treatment plan",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/physical-exam-task"
    },
    {
      "id": "disposition",
      "title": "Duty restrictions or activity modifications placed in system/SF 600",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/disposition"
    },
    {
      "id": "follow-up",
      "title": "Follow up instructions and appointment scheduled",
      "definitionCanonical": "https://hiivehealth.com/activitydefinition/follow-up"
    }
  ]
}
```

### Step 2 — Create separate `Questionnaire` resources for each SOAP section

Each SOAP section gets its own `Questionnaire`. This makes extraction mapping small and focused, which aligns with Medplum's recommendation.

#### Subjective questionnaire (HPI + complaints)

```json
{
  "resourceType": "Questionnaire",
  "url": "https://hiivehealth.com/questionnaire/soap-subjective",
  "name": "HiiveSOAPSubjective",
  "title": "Subjective",
  "status": "active",
  "item": [
    {
      "linkId": "hpi",
      "type": "text",
      "text": "History of Present Illness"
    },
    {
      "linkId": "chief-complaint",
      "type": "string",
      "text": "Chief Complaint",
      "repeats": true
    }
  ]
}
```

#### Review of Systems questionnaire

```json
{
  "resourceType": "Questionnaire",
  "url": "https://hiivehealth.com/questionnaire/review-of-systems",
  "name": "HiiveReviewOfSystems",
  "title": "Review of Systems",
  "status": "active",
  "item": [
    {
      "linkId": "constitutional",
      "type": "group",
      "text": "Constitutional",
      "item": [
        { "linkId": "constitutional-negative", "type": "boolean", "text": "Negative" },
        { "linkId": "constitutional-fever", "type": "boolean", "text": "Fever" },
        { "linkId": "constitutional-chills", "type": "boolean", "text": "Chills" }
      ]
    },
    {
      "linkId": "respiratory",
      "type": "group",
      "text": "Respiratory",
      "item": [
        { "linkId": "respiratory-negative", "type": "boolean", "text": "Negative" },
        { "linkId": "respiratory-cough", "type": "boolean", "text": "Cough" },
        { "linkId": "respiratory-dyspnea", "type": "boolean", "text": "Shortness of breath" }
      ]
    }
  ]
}
```

#### ROS template catalog and searchable selection

Replace the single fixed ROS form with a **three-template catalog** derived from [ROS Medplum.xlsx](ROS/ROS%20Medplum.xlsx). A clinician selects one template for an encounter; the selected template is then the only ROS Questionnaire rendered in that encounter's ROS card.

| Catalog label | Source worksheet | Canonical URL suffix | Capture contract |
|---|---|---|---|
| ROS Brief - Normal | `ROS Brief - Normal` | `ros-brief-normal` | Seven configured fields. Each field offers `no`, `mild`, `moderate`, or `severe`; the source default is `no`. |
| ROS Extended - Normal | `ROS Extended - Normal` | `ros-extended-normal` | Forty-four configured fields. Each field offers `no`, `mild`, `moderate`, or `severe`; the source default is `no`. |
| ROS Unable to Obtain | `ROS Unable to Obtain` | `ros-unable-to-obtain` | One required reason selection: altered mental status, decreased level of consciousness, uncooperative behavior, or intubation. The source permits a blank initial value. |

The Brief and Extended Auto Text Templates supply the complete clinical mappings used by their Questionnaires. Brief includes seven fields across Constitutional, Respiratory, and Cardiovascular. Extended includes forty-four fields across Constitutional, Skin, ENMT, Respiratory, Cardiovascular, Gastrointestinal, Genitourinary, Musculoskeletal, Neurologic, Psychiatric, Heme/Lymph, and Allergy/Immunologic.

##### Clinician workflow

1. In the ROS card, show a compact `ROS template` searchable combobox before any ROS questions.
2. The combobox searches the three catalog labels and returns a constrained selection; it is not a free-text clinical-note field.
3. Selecting a template creates or replaces the encounter's ROS `QuestionnaireResponse` with a `questionnaire` canonical matching that template. Require confirmation before replacing a response that already has answers.
4. Render only the selected Questionnaire. Persist the selection immediately and debounce answer saves using the existing SOAP response flow.
5. At signing, include the selected ROS `QuestionnaireResponse` in the SOAP `Composition` and extract the answers to the established ROS `Observation` representation.

##### Resource and persistence contract

- Create three active `Questionnaire` resources at `https://hiivehealth.com/questionnaire/ros-brief-normal`, `.../ros-extended-normal`, and `.../ros-unable-to-obtain`.
- Give each a stable `name`, a human-readable `title` for catalog search only, and a `useContext` or extension identifying it as a SOAP ROS template.
- Store the selected canonical URL in `QuestionnaireResponse.questionnaire`; this is the authoritative encounter-level template selection. Do not add a second free-text selector field to the response.
- Keep a template-independent ROS card. It loads existing ROS responses by `encounter`, recognizes any of the three canonical URLs, and offers the catalog only when no ROS response exists or the clinician elects to replace it.
- For Brief and Extended responses, represent each approved item as a coded choice answer with the source severity values. For Unable to Obtain, create one coded reason answer and do not create normal-system findings.
- Update `extractSoapResponse()` to accept all three canonical URLs. Extraction must retain the selected template URL in its source/provenance context so a reviewer can distinguish a normal ROS from an unavailable ROS.

##### Delivery slices and verification

1. **Catalog and schema:** add the three Questionnaire definitions, catalog metadata, and an importer update. Verify each field against the workbook Auto Text Template before publication.
2. **Selector UI:** replace the fixed ROS card with a searchable constrained combobox and template-aware renderer. Test search, selection, cancellation, and replacement confirmation.
3. **Persistence and extraction:** load/save by selected canonical, extend extraction, and preserve template identity in signed output. Test all three Questionnaires, including an Unable to Obtain reason.
4. **Clinical validation:** have a clinical owner approve every Brief/Extended label, grouping, default, and code before release. Verify a signed encounter contains exactly one selected ROS response and no contradictory normal and unavailable ROS findings.

#### Objective questionnaire (vitals + physical exam)

Vitals belong to the **Objective** section. The no-custom-UI baseline uses a `Vitals` group with unit choices and conditional decimal inputs. This keeps capture declarative FHIR while allowing a clinician to select the unit before entering a value.

```json
{
  "resourceType": "Questionnaire",
  "url": "https://hiivehealth.com/questionnaire/soap-objective",
  "name": "HiiveSOAPObjective",
  "title": "Objective",
  "status": "active",
  "item": [
    {
      "linkId": "vitals",
      "type": "group",
      "text": "Vitals",
      "item": [
        {
          "linkId": "temperature-unit",
          "type": "choice",
          "text": "Temperature unit",
          "answerOption": [
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "[degF]", "display": "Fahrenheit (°F)" } },
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "Cel", "display": "Celsius (°C)" } }
          ]
        },
        { "linkId": "temperature-f", "type": "decimal", "text": "Temp (°F)", "enableWhen": [{ "question": "temperature-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "[degF]" } }] },
        { "linkId": "temperature-c", "type": "decimal", "text": "Temp (°C)", "enableWhen": [{ "question": "temperature-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "Cel" } }] },
        { "linkId": "heart-rate", "type": "integer", "text": "HR (bpm)" },
        {
          "linkId": "weight-unit",
          "type": "choice",
          "text": "Weight unit",
          "answerOption": [
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "[lb_av]", "display": "Pounds (lb)" } },
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "kg", "display": "Kilograms (kg)" } }
          ]
        },
        { "linkId": "weight-lb", "type": "decimal", "text": "Weight (lb)", "enableWhen": [{ "question": "weight-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "[lb_av]" } }] },
        { "linkId": "weight-kg", "type": "decimal", "text": "Weight (kg)", "enableWhen": [{ "question": "weight-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "kg" } }] },
        {
          "linkId": "height-unit",
          "type": "choice",
          "text": "Height unit",
          "answerOption": [
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "[in_i]", "display": "Inches (in)" } },
            { "valueCoding": { "system": "http://unitsofmeasure.org", "code": "cm", "display": "Centimeters (cm)" } }
          ]
        },
        { "linkId": "height-in", "type": "decimal", "text": "Height (in)", "enableWhen": [{ "question": "height-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "[in_i]" } }] },
        { "linkId": "height-cm", "type": "decimal", "text": "Height (cm)", "enableWhen": [{ "question": "height-unit", "operator": "=", "answerCoding": { "system": "http://unitsofmeasure.org", "code": "cm" } }] },
        { "linkId": "spO2", "type": "integer", "text": "SpO₂ (%)" },
        { "linkId": "respiratory-rate", "type": "integer", "text": "RR (b/m)" },
        { "linkId": "systolic", "type": "integer", "text": "SBP (mmHg)" },
        { "linkId": "diastolic", "type": "integer", "text": "DBP (mmHg)" }
      ]
    },
    { "linkId": "physical-exam", "type": "text", "text": "Physical Examination" }
  ]
}
```

#### Vital layout and units

The reference layout has a dense, multi-column vitals panel with a collapsible "Additional Vitals" area. That exact layout is **not guaranteed by Medplum's stock `QuestionnaireForm`**: standard FHIR `Questionnaire` defines the questions and conditional behavior, but does not require a renderer to honor a specific grid, panel color, or inline unit-toggle design.

Use this decision rule:

| Requirement | No-custom-UI approach | Custom-renderer approach |
|---|---|---|
| Capture Temp, HR, Weight, Height, SpO₂, RR, BP, glucose, or visual acuity | Native `Questionnaire` groups and items | Same `Questionnaire` contract |
| Let the clinician select °F/°C, lb/kg, or in/cm | `choice` item plus `enableWhen` conditional decimal items | Segmented unit controls attached to one measurement input |
| Store interoperable data | Extract to LOINC-coded `Observation.valueQuantity` with UCUM units | Same output contract |
| Match the supplied compact grid and "Additional Vitals" disclosure | Not reliable across generic renderers | Required: purpose-built Vitals panel bound to the same `QuestionnaireResponse` or directly to `Observation`s |

For the native-first path, the clinician chooses the unit before entering a value. The extractor reads the enabled answer, writes its selected UCUM unit, and should reject a response containing values in both alternatives for one measurement. Do not silently convert or retain a hidden alternate-unit value without an explicit conversion policy.

The extracted `Observation` resources use standard LOINC and UCUM, for example:

| Measurement | LOINC code | UCUM code |
|---|---|---|
| Body temperature | `8310-5` | `[degF]` or `Cel` |
| Heart rate | `8867-4` | `/min` |
| Body weight | `29463-7` | `[lb_av]` or `kg` |
| Body height | `8302-2` | `[in_i]` or `cm` |
| Oxygen saturation | `59408-5` | `%` |
| Respiratory rate | `9279-1` | `/min` |
| Systolic / diastolic blood pressure | `8480-6` / `8462-4` | `mm[Hg]` |

### Vital-signs delivery plan

1. **Native capture slice:** Replace the fixed-unit Objective fields with the `Vitals` group, conditional unit choices, and a separate optional `Additional Vitals` group. Verify that selecting each unit exposes only its matching value input.
2. **Extraction slice:** Extend the SOAP extractor to emit LOINC-coded `Observation.valueQuantity` resources with the selected UCUM code. Reject conflicting alternate-unit answers and verify one Observation per populated vital.
3. **Workflow validation slice:** Test an encounter with °F/lb/in and another with °C/kg/cm. Confirm the saved `QuestionnaireResponse`, extracted `Observation`s, and signed `Composition` retain the original selected units.
4. **Layout decision slice:** Review the native renderer with clinicians. If the compact grid, inline unit toggles, and collapsible Additional Vitals panel are acceptance criteria, build one focused Vitals renderer while retaining the same FHIR contract and extraction tests.

#### Assessment questionnaire

```json
{
  "resourceType": "Questionnaire",
  "url": "https://hiivehealth.com/questionnaire/soap-assessment",
  "name": "HiiveSOAPAssessment",
  "title": "Assessment",
  "status": "active",
  "item": [
    {
      "linkId": "diagnoses",
      "type": "string",
      "text": "Diagnoses",
      "repeats": true
    },
    {
      "linkId": "differential-diagnoses",
      "type": "string",
      "text": "Differential Diagnoses",
      "repeats": true
    },
    {
      "linkId": "assessment-note",
      "type": "text",
      "text": "Clinical Assessment Summary"
    }
  ]
}
```

#### Plan questionnaire

```json
{
  "resourceType": "Questionnaire",
  "url": "https://hiivehealth.com/questionnaire/soap-plan",
  "name": "HiiveSOAPPlan",
  "title": "Plan",
  "status": "active",
  "item": [
    {
      "linkId": "plan-free-text",
      "type": "text",
      "text": "Plan Free Text"
    },
    {
      "linkId": "patient-disposition",
      "type": "choice",
      "text": "Patient Disposition",
      "answerOption": [
        { "valueCoding": { "code": "home", "display": "Discharge to home" } },
        { "valueCoding": { "code": "limited-duty", "display": "Limited duty profile" } }
      ]
    },
    {
      "linkId": "disposition-end-date",
      "type": "date",
      "text": "Disposition End Date"
    }
  ]
}
```

### Step 3 — Create `ActivityDefinition`s for checklist tasks and orders

The `PlanDefinition` actions point to `ActivityDefinition` resources of `kind` = `"Task"` for checklist items and `kind` = `"ServiceRequest"` for orders.

#### Checklist task example

```json
{
  "resourceType": "ActivityDefinition",
  "url": "https://hiivehealth.com/activitydefinition/chief-complaint-task",
  "name": "ChiefComplaintTask",
  "status": "active",
  "kind": "Task",
  "intent": "order",
  "code": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/task-code",
      "code": "fulfill",
      "display": "Fulfill the focal request"
    }]
  }
}
```

#### Order example

```json
{
  "resourceType": "ActivityDefinition",
  "url": "https://hiivehealth.com/activitydefinition/follow-up",
  "name": "FollowUpInstructions",
  "status": "active",
  "kind": "ServiceRequest",
  "intent": "order",
  "code": {
    "coding": [{
      "system": "http://snomed.info/sct",
      "code": "185317003",
      "display": "Telephone follow-up"
    }]
  }
}
```

### Step 4 — Build the facility hierarchy (`Location` resources)

The no-code facility builder (building → floor → room → station/bed/chair) maps directly to a FHIR `Location` hierarchy.

#### Building
```json
{
  "resourceType": "Location",
  "name": "Headquarters Clinic",
  "status": "active",
  "mode": "instance",
  "type": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-RoleCode", "code": "HOSP", "display": "Hospital" }] }],
  "physicalType": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/location-physical-type", "code": "si", "display": "Site" }] }
}
```

#### Floor
```json
{
  "resourceType": "Location",
  "name": "Floor 2",
  "status": "active",
  "mode": "instance",
  "partOf": { "reference": "Location/building-123" },
  "physicalType": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/location-physical-type", "code": "lvl", "display": "Level" }] }
}
```

#### Room
```json
{
  "resourceType": "Location",
  "name": "Exam Room 201",
  "status": "active",
  "mode": "instance",
  "partOf": { "reference": "Location/floor-2-123" },
  "physicalType": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/location-physical-type", "code": "ro", "display": "Room" }] }
}
```

#### Station / Bed / Chair
```json
{
  "resourceType": "Location",
  "name": "Bed A",
  "status": "active",
  "mode": "instance",
  "partOf": { "reference": "Location/room-201-123" },
  "type": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-RoleCode", "code": "BED", "display": "Bed" }] }],
  "physicalType": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/location-physical-type", "code": "bd", "display": "Bed" }] }
}
```

#### Querying the hierarchy

To populate the "Room and Station" dropdowns in the SOAP note:

1. **Rooms:** `GET /fhir/R4/Location?partof=Location/floor-2-123&physicaltype=ro`
2. **Stations:** `GET /fhir/R4/Location?partof=Location/room-201-123`
3. **Full path:** Walk up the `partOf` chain from the selected station to display "Building → Floor → Room → Bed".

When the provider selects a station, save it to the encounter:

```json
{
  "resourceType": "Encounter",
  "location": [{
    "location": { "reference": "Location/bed-a-123" },
    "status": "active",
    "period": { "start": "2026-07-13T12:46:00Z" }
  }]
}
```

### Step 5 — Make the template selectable in the Provider app

The Provider app already supports selecting a `PlanDefinition` when creating an encounter ([EncounterModal.tsx](../medplum-provider/src/pages/encounter/EncounterModal.tsx)). The "Apply care template" card uses a `ResourceInput` with `resourceType="PlanDefinition"`. Ensure the SOAP `PlanDefinition` is created and active; it will appear in that search.

When the provider clicks **Create Encounter**, the existing `createEncounter()` utility ([encounter.ts](../medplum-provider/src/utils/encounter.ts)):

1. Creates an `Appointment`.
2. Creates the `Encounter`.
3. Creates an initial `ClinicalImpression`.
4. Calls `PlanDefinition/$apply`, which generates `Task`s and `ServiceRequest`s from the template actions.
5. Creates `ChargeItem`s if billing extensions are present.

### Step 6 — Render the encounter chart

The existing `EncounterChart` component ([EncounterChart.tsx](../medplum-provider/src/components/encounter/EncounterChart.tsx)) loads the encounter, patient, tasks, clinical impression, and charge items via `useEncounterChart`.

To mimic the HiiveHealth layout, extend `EncounterChart` with these native Medplum React/Mantine pieces:

| UI element | Native component/resource |
|------------|---------------------------|
| Encounter header | `EncounterHeader` (already exists) — shows status, provider, date, Sign / Sign & Close buttons. |
| Clinical Decision Flows dropdown | `Select` from Mantine populated with available `Questionnaire`s tagged as decision flows; on change, render the selected `Questionnaire` inline or in a modal. |
| Checklist | Render `TaskPanel` (already used in `EncounterChart`) filtered to tasks generated by the template. |
| Room and Station | Cascading Mantine `Select`s populated from `Location` hierarchy: building → floor → room → station. Save selected station to `Encounter.location`. |
| Vitals panel | Either a custom form that creates LOINC-coded `Observation` resources, or a Vitals `Questionnaire` followed by `$extract`. Use `CodeInput`/`CodingInput` for code selection and native inputs for values. |
| Subjective / Objective / Assessment / Plan cards | Cards from `@mantine/core` each containing a `<QuestionnaireForm>` bound to the section-specific `Questionnaire`. On submit, persist the `QuestionnaireResponse` and extract into proper FHIR resources. |
| Diagnosis pickers | `ResourceInput resourceType="Condition"` or `CodeInput` bound to an ICD-10 ValueSet. |
| Orders | `SearchControl` for `ServiceRequest?encounter=...` plus `AddPlanDefinition` to apply additional order sets. |
| Sign / Sign & Close | `Provenance` creation already implemented in `EncounterChart.tsx`. |

### Step 7 — Assemble the final SOAP document (optional)

After signing, create a `Composition` that references all resources generated during the encounter:

```json
{
  "resourceType": "Composition",
  "status": "final",
  "type": { "coding": [{ "system": "http://loinc.org", "code": "11506-3", "display": "Progress note" }] },
  "subject": { "reference": "Patient/..." },
  "encounter": { "reference": "Encounter/..." },
  "date": "2026-07-13T12:46:00Z",
  "author": [{ "reference": "Practitioner/..." }],
  "title": "Sick Call SOAP Note",
  "section": [
    {
      "title": "Subjective",
      "entry": [
        { "reference": "Observation/hpi-..." },
        { "reference": "Observation/ros-constitutional-..." },
        { "reference": "Condition/chief-complaint-..." }
      ]
    },
    {
      "title": "Objective",
      "entry": [
        { "reference": "Observation/vitals-..." },
        { "reference": "Observation/physical-exam-..." }
      ]
    },
    {
      "title": "Assessment",
      "entry": [
        { "reference": "Condition/diagnosis-..." }
      ]
    },
    {
      "title": "Plan",
      "entry": [
        { "reference": "CarePlan/..." },
        { "reference": "ServiceRequest/..." }
      ]
    }
  ]
}
```

### Step 7 — Extract `QuestionnaireResponse` answers into FHIR resources

Medplum's `QuestionnaireResponse/$extract` operation converts submitted answers into resources. Use it (or a Medplum Bot) after each section is saved.

For example, after the Subjective section is submitted, the Bot parses the HPI answer and creates:

```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "survey" }] }],
  "code": { "text": "History of Present Illness" },
  "subject": { "reference": "Patient/..." },
  "encounter": { "reference": "Encounter/..." },
  "performer": [{ "reference": "Patient/..." }],
  "effectiveDateTime": "2026-07-13T12:46:00Z",
  "valueString": "Patient reports sore throat and low-grade fever for two days."
}
```

The Review of Systems `QuestionnaireResponse` is extracted into one `Observation` per positive system:

```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "survey" }] }],
  "code": { "coding": [{ "system": "http://loinc.org", "code": "10154-3", "display": "Subjective review of systems" }] },
  "subject": { "reference": "Patient/..." },
  "encounter": { "reference": "Encounter/..." },
  "performer": [{ "reference": "Patient/..." }],
  "component": [
    { "code": { "text": "Constitutional" }, "valueCodeableConcept": { "coding": [{ "code": "fever", "display": "Fever" }] } }
  ]
}
```

The Plan questionnaire can generate a `CarePlan` and additional `ServiceRequest`s:

```json
{
  "resourceType": "CarePlan",
  "status": "active",
  "intent": "plan",
  "title": "Sick Call Treatment Plan",
  "description": "Rest, fluids, acetaminophen PRN, return precautions given.",
  "subject": { "reference": "Patient/..." },
  "encounter": { "reference": "Encounter/..." }
}
```

Store the resulting resource IDs on the `QuestionnaireResponse` via `extension` or `basedOn` references so the chart can reload them on refresh.

### Step 8 — Assemble the final SOAP document (optional)

After signing, create a `Composition` that references all extracted resources:

```json
{
  "resourceType": "Composition",
  "status": "final",
  "type": { "coding": [{ "system": "http://loinc.org", "code": "11506-3", "display": "Progress note" }] },
  "subject": { "reference": "Patient/..." },
  "encounter": { "reference": "Encounter/..." },
  "date": "2026-07-13T12:46:00Z",
  "author": [{ "reference": "Practitioner/..." }],
  "title": "Sick Call SOAP Note",
  "section": [
    {
      "title": "Subjective",
      "entry": [
        { "reference": "Observation/hpi-..." },
        { "reference": "Observation/ros-constitutional-..." },
        { "reference": "Condition/chief-complaint-..." }
      ]
    },
    {
      "title": "Objective",
      "entry": [
        { "reference": "Observation/vitals-..." },
        { "reference": "Observation/physical-exam-..." }
      ]
    },
    {
      "title": "Assessment",
      "entry": [
        { "reference": "Condition/diagnosis-..." }
      ]
    },
    {
      "title": "Plan",
      "entry": [
        { "reference": "CarePlan/..." },
        { "reference": "ServiceRequest/..." }
      ]
    }
  ]
}
```

## Key design principles

1. **No-code facility builder maps to `Location` hierarchy.** Buildings, floors, rooms, and stations/beds/chairs become nested `Location` resources linked via `partOf`. The SOAP note selects the station and stores it on `Encounter.location`.
2. **Create one `PlanDefinition` per visit type** to drive the checklist and default orders. This is the encounter template pattern already implemented in the Provider app.
3. **Use one `Questionnaire` per SOAP section** for capture. This keeps extraction mappings small, lets providers complete sections independently, and matches the modular layout in the HiiveHealth screenshots.
4. **Questionnaires are for capture only.** Submitted `QuestionnaireResponse` answers must be extracted into proper, queryable FHIR resources (`Observation`, `Condition`, `ClinicalImpression`, `CarePlan`, `ServiceRequest`) via `$extract` or a Bot.
5. **`ClinicalImpression`** is the chart-level container for assessment and summary. It can reference extracted `Condition`, `Observation`, and `CarePlan` resources.
6. **`Task`** is the native checklist item. `PlanDefinition/$apply` creates tasks automatically; `TaskPanel` renders them.
7. **`Provenance`** is the native signature/audit mechanism, already used for Sign / Sign & Close.
8. **`Composition`** is the finalized document. It is not a form and should be generated after the encounter is signed.

## Files to reference

- Provider app encounter creation: [medplum-provider/src/pages/encounter/EncounterModal.tsx](../medplum-provider/src/pages/encounter/EncounterModal.tsx)
- Encounter chart rendering: [medplum-provider/src/components/encounter/EncounterChart.tsx](../medplum-provider/src/components/encounter/EncounterChart.tsx)
- Chart data hook: [medplum-provider/src/hooks/useEncounterChart.ts](../medplum-provider/src/hooks/useEncounterChart.ts)
- Create encounter utility (PlanDefinition/$apply): [medplum-provider/src/utils/encounter.ts](../medplum-provider/src/utils/encounter.ts)
- Apply additional PlanDefinition to existing encounter: [medplum-provider/src/components/plandefinition/AddPlanDefinition.tsx](../medplum-provider/src/components/plandefinition/AddPlanDefinition.tsx)
- Sample template bundle (PlanDefinition + Questionnaires + ActivityDefinitions): [medplum-provider/src/data/simple-initial-visit-bundle.json](../medplum-provider/src/data/simple-initial-visit-bundle.json)

## Summary

The HiiveHealth SOAP note can be reproduced almost entirely with Medplum-native constructs using **Option B**: separate `Questionnaire` resources per SOAP section.

- **`PlanDefinition`** as the visit template for the checklist and default orders.
- **Separate `Questionnaire` resources** for Subjective, Objective, Assessment, and Plan capture, plus a dedicated Review of Systems `Questionnaire`.
- **`QuestionnaireResponse`** for submitted answers; answers are then extracted into proper FHIR resources.
- **`Observation`** for HPI, ROS, vitals, and objective/physical-exam findings.
- **`Condition`** for complaints, diagnoses, and differentials.
- **`ServiceRequest`** / **`CarePlan`** for the plan and orders.
- **`Task`** for the checklist.
- **`Provenance`** for signing.
- **`Composition`** as the final signed document.

The Provider app already has the infrastructure to create encounters from a `PlanDefinition`, apply it, display tasks, and sign via `Provenance`. The remaining work is authoring the SOAP-specific `PlanDefinition`, `Questionnaire`, and `ActivityDefinition` resources, implementing the section-specific extraction logic (via `$extract` or a Bot), and extending the chart UI to render the four SOAP cards.
