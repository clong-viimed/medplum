# HiiveHealth SOAP Note in Medplum — Manual Test Plan

Last updated: 2026-07-14

## Prerequisites

1. **AWS SSO session is active** (required for backend connectivity):
   ```bash
   aws sso login --profile hiive-build
   ```

2. **Dev servers are running** on their expected ports:
   | App | Port | Command |
   |-----|------|---------|
   | Medplum app | `3001` | `cd medplum-ubix/packages/app && npm run dev` |
   | Provider app | `5172` | `cd medplum-provider && npm run dev` |
   | Patient app | `5173` | `cd medplum-patient && npm run dev` |

3. **Browser**: Use an incognito/private window for the first login test to avoid stale localStorage.

4. **Test patient**: Create or locate a `Patient` in the provider app. Note the patient ID.

5. **Test practitioner**: Log in as a provider/clinician user who can write encounters.

---

## Test 1 — Auth redirect loop is fixed

**Goal**: Verify logging out and back in no longer loops between `/logout` and `/signin`.

1. Open the Medplum app at `http://127.0.0.1:3001/` in an incognito window.
2. Sign in with valid credentials.
3. Confirm the home page loads (search page) without redirecting to `/logout`.
4. Click the user menu and choose **Sign out**.
5. Confirm you land on `/signin` and **not** `/logout`.
6. Sign in again.

**Expected**: Smooth login → home → sign out → login, no loop. No `Search engine null is not supported` console error.

---

## Test 2 — Location hierarchy loads and cascades

**Goal**: Verify building → floor → room → station selectors work and save to the encounter.

1. In the provider app, navigate to an existing encounter or create one via **Encounters → New Encounter**.
2. In the **Room and Station** card, open the **Building** dropdown.
3. Select **HiiveCare Main Campus**.
4. Open the **Floor** dropdown — expect floors such as `Floor 1`, `Floor 2`.
5. Select **Floor 1**.
6. Open the **Room** dropdown — expect rooms such as `Room 101`, `Room 102`.
7. Select **Room 101**.
8. Open the **Station** dropdown — expect stations such as `Bed A`, `Bed B`.
9. Select **Bed A**.
10. Save/refresh the page.

**Expected**: After refresh, the encounter's `location` references `Location/Bed A` (or equivalent). The selectors rehydrate to the previously selected values.

**Backend verification**:
```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/verify-location-hierarchy.mjs
```
> If the script does not exist, verify via the FHIR API: `GET https://api.ehr.hiivehealth.net/fhir/R4/Location?partof=<building-id>`.

---

## Test 3 — Sick Call template creates checklist Tasks

**Goal**: Verify a Sick Call encounter applies the PlanDefinition and instantiates 6 Tasks.

1. In the provider app, create a new encounter:
   - Patient: your test patient
   - Type/Class: select **Sick Call** (or any visit type mapped to the Sick Call `PlanDefinition`)
2. Save the encounter.
3. Open the **Tasks** panel on the chart.

**Expected**: Six checklist Tasks appear, e.g.:
- Review chief complaint
- Record vital signs
- Document HPI
- Perform physical exam
- Document assessment
- Document plan / disposition

Each Task has status `requested`.

**Backend verification**:
```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/verify-sick-call-template.mjs
```
Expected output: `$apply created 1 CarePlan and 6 Tasks with status 'requested'`.

---

## Test 4 — SOAP questionnaires render and save responses

**Goal**: Each SOAP section card accepts input and persists a `QuestionnaireResponse`.

1. Open an encounter chart.
2. Scroll to the SOAP section cards:
   - **Subjective**
   - **Review of Systems**
   - **Objective**
   - **Assessment**
   - **Plan**
3. Fill in each card:
   - Subjective: chief complaint, HPI
   - ROS: check at least one system (e.g., Respiratory — "Shortness of breath")
   - Objective: enter vitals (temperature, heart rate, blood pressure, etc.)
   - Assessment: add one or more diagnoses
   - Plan: add orders, disposition, follow-up
4. Blur/click outside each card to trigger auto-save.
5. Refresh the page.

**Expected**: All entered values reload into the same cards. No console errors.

**Backend verification**:
```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/verify-soap-questionnaires.mjs
```
Expected: 5 SOAP `Questionnaire` resources exist on the server.

---

## Test 5 — Extraction creates clinical resources

**Goal**: After saving SOAP responses, `Observation`, `Condition`, and `CarePlan` resources are created.

1. Complete Test 4 with realistic data.
2. Open browser DevTools → Network tab.
3. Watch for POST/PUT calls to `Observation`, `Condition`, `CarePlan`.

**Expected**:
- Subjective/ROS responses extract to `Observation` resources with LOINC codes.
- Assessment diagnoses extract to `Condition` resources with `category: encounter-diagnosis`.
- Plan text extracts to a `CarePlan`.

**Backend verification**:
```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/verify-soap-extraction.mjs
```
Expected output similar to: `7 Observations, 2 Conditions, 1 CarePlan created`.

---

## Test 6 — Vitals in Objective card

**Goal**: Vitals captured in the Objective `Questionnaire` are extracted as LOINC-coded `Observation`s.

1. Open the **Objective** card.
2. Enter:
   - Temperature: `98.6 F`
   - Heart rate: `72 bpm`
   - Respiratory rate: `16 /min`
   - Blood pressure: `120/80 mmHg`
   - SpO2: `98 %`
   - Weight: `170 lbs`
   - Height: `5 ft 10 in`
3. Save/blur.

**Expected**: Each vital appears as a separate `Observation` with the correct LOINC code, e.g.:
- `8310-5` Body temperature
- `8867-4` Heart rate
- `9279-1` Respiratory rate
- `8480-6` Systolic BP
- `8462-4` Diastolic BP
- `2708-6` Oxygen saturation
- `29463-7` Body weight
- `8302-2` Body height

---

## Test 7 — Orders panel

**Goal**: Add individual orders and order sets, then view them in the Orders panel.

1. In the **Orders** panel, click **+ Order**.
2. Add one of each type if available:
   - Medication
   - Lab
   - Imaging
   - Procedure
   - Immunization
3. Apply an order set (e.g., **Chest Pain Workup**) if configured.
4. Save each order.

**Expected**: Orders appear in the panel with status, type, and description. Order sets expand into multiple `ServiceRequest`/`MedicationRequest` resources.

---

## Test 8 — Disposition updates Encounter

**Goal**: Selecting a disposition in the Plan card updates `Encounter.hospitalization.dischargeDisposition`.

1. Open the **Plan** card.
2. Select a disposition such as **Return to work with restrictions**.
3. Optionally pick an end date.
4. Save/blur.

**Expected**: The encounter's `hospitalization.dischargeDisposition` contains the selected code/display. The end date appears in an extension.

**API verification**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.ehr.hiivehealth.net/fhir/R4/Encounter/<encounter-id>"
```
Look for `dischargeDisposition.coding` and extension `https://hiivehealth.com/fhir/StructureDefinition/disposition-end-date`.

---

## Test 9 — Clinical decision flows

**Goal**: Select and complete a decision-flow questionnaire.

1. In the **Clinical Decision Flows** panel, select **Chest Pain**.
2. Answer the questionnaire (e.g., onset, severity, radiation, risk factors).
3. Save.
4. Repeat with **Respiratory** if desired.

**Expected**: The flow renders inline, saves a `QuestionnaireResponse`, and links to the encounter.

---

## Test 10 — Sign & Close creates Provenance, ClinicalImpression, and Composition

**Goal**: The full close-of-encounter workflow produces a signed clinical document.

1. Complete Tests 4–9 so the encounter has data in every section.
2. Complete all checklist Tasks in the Task panel (or leave some incomplete for the lock test).
3. Click **Sign** (do not lock).

**Expected**:
- A `Provenance` resource is created targeting the `Encounter`.
- `ClinicalImpression.status` remains `completed` if it was already completed, or becomes `completed` on lock.
- A signed `Composition` is created with four sections: Subjective, Objective, Assessment, Plan.

4. Click **Sign & Close** (lock).

**Expected**:
- All incomplete Tasks are marked `completed`.
- `ClinicalImpression.status` = `completed`.
- Another `Provenance` is created.
- A final `Composition` is created with `status: final`.

**Backend verification**:
```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/verify-sign-and-composition.mjs
```
Expected output: confirms `Provenance`, completed `ClinicalImpression`, and `Composition` exist.

---

## Test 11 — Synthetic patient integration (optional)

**Goal**: Confirm the encounter flow works against synthetic patients from `hiivecare-dev-data-pipeline`.

1. Follow the pipeline instructions in `hiivecare-dev-data-pipeline/docs/data-synthesis-requirements.md` to generate/load patients.
2. Open one synthetic patient in the provider app.
3. Create a Sick Call encounter and run Tests 2–10.

**Expected**: Same behavior as a manually created patient.

---

## Test 12 — Patient app read-only view (optional)

**Goal**: Ensure the patient app does not break and can view encounter data.

1. Open the patient app at `http://127.0.0.1:5173/`.
2. Sign in as the test patient.
3. Navigate to the encounter/visit summary.

**Expected**: Encounter details load without errors. SOAP note content may be shown as a simplified summary depending on patient-app scope.

---

## Quick smoke-test checklist

Use this shorter list for routine regression checks:

- [ ] Medplum app login/logout works on `3001`
- [ ] Provider app loads on `5172`
- [ ] Patient app loads on `5173`
- [ ] Location selector cascades building → floor → room → station
- [ ] Sick Call encounter creates 6 checklist Tasks
- [ ] Subjective, ROS, Objective, Assessment, Plan cards save and reload
- [ ] Vitals extract to LOINC-coded Observations
- [ ] Assessment diagnoses extract to Conditions
- [ ] Plan extracts to CarePlan and updates disposition
- [ ] Orders panel adds/displays orders
- [ ] Decision flows render and save
- [ ] Sign & Close creates Provenance, completes ClinicalImpression, and generates Composition

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login loop | Clear `localStorage` keys `defaultResourceType` and `logout-defaultSearch`, then hard-refresh |
| `Search engine null is not supported` | Same as above; stale localStorage is the cause |
| 403 from backend scripts | Run `aws sso login --profile hiive-build` |
| Location dropdown empty | Verify seed data loaded: `node scripts/verify-location-hierarchy.mjs` |
| Tasks not appearing | Verify Sick Call template: `node scripts/verify-sick-call-template.mjs` |
| Composition not created | Check DevTools Network for `persistAll` errors; ensure all questionnaire responses save first |

---

## Files referenced

- [medplum-provider/src/components/encounter/EncounterChart.tsx](../medplum-provider/src/components/encounter/EncounterChart.tsx)
- [medplum-provider/src/hooks/useSoapQuestionnaires.ts](../medplum-provider/src/hooks/useSoapQuestionnaires.ts)
- [medplum-provider/src/utils/soap-composition.ts](../medplum-provider/src/utils/soap-composition.ts)
- [medplum-ubix/scripts/verify-location-hierarchy.mjs](../medplum-ubix/scripts/verify-location-hierarchy.mjs)
- [medplum-ubix/scripts/verify-sick-call-template.mjs](../medplum-ubix/scripts/verify-sick-call-template.mjs)
- [medplum-ubix/scripts/verify-soap-questionnaires.mjs](../medplum-ubix/scripts/verify-soap-questionnaires.mjs)
- [medplum-ubix/scripts/verify-soap-extraction.mjs](../medplum-ubix/scripts/verify-soap-extraction.mjs)
- [medplum-ubix/scripts/verify-sign-and-composition.mjs](../medplum-ubix/scripts/verify-sign-and-composition.mjs)
