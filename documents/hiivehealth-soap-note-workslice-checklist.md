# HiiveHealth SOAP Note in Medplum — Work Slice Checklist

Last updated: 2026-07-14

## How to use this checklist

- [ ] = not started
- [/] = in progress
- [x] = done
- Update this file after each slice is complete.

## Phase 1 — Foundation

- [x] **1.1** Create sample `Location` hierarchy bundle (building → floor → room → station/bed)
- [x] **1.2** Add cascading Location selectors to `EncounterChart` and save selected station to `Encounter.location`
- [x] **1.3** Load sample `Location` data and verify the chart loads/saves location correctly

## Phase 2 — Visit type and checklist

- [x] **2.1** Define one Hiive visit type (e.g., Sick Call) as a `PlanDefinition`
- [x] **2.2** Define checklist items as `ActivityDefinition` (`kind: "Task"`)
- [x] **2.3** Confirm `PlanDefinition/$apply` creates `Task`s and renders in `TaskPanel`
- [x] **2.4** Confirm checklist is advisory and does not block signing

## Phase 3 — SOAP section questionnaires

- [x] **3.1** Create separate `Questionnaire`s for Subjective, Objective, Assessment, Plan
- [x] **3.2** Add Review of Systems `Questionnaire` with grouped systems
- [x] **3.3** Render each `Questionnaire` inside a Mantine card in `EncounterChart`
- [x] **3.4** Save each `QuestionnaireResponse` and link to `Encounter`

## Phase 4 — Extraction and clinical resources

- [ ] **4.1** Implement `$extract` or Bot to convert Subjective responses to `Observation`s
- [ ] **4.2** Extract ROS responses to per-system `Observation`s
- [ ] **4.3** Extract Assessment responses to `Condition` resources
- [ ] **4.4** Extract Plan responses to `CarePlan` and update `Encounter.hospitalization.dischargeDisposition`
- [ ] **4.5** Track extracted resource IDs for later `Composition` assembly

## Phase 5 — Vitals and orders

- [ ] **5.1** Create vitals `Questionnaire` or direct form that produces LOINC-coded `Observation`s
- [ ] **5.2** Build "+ Order" UI supporting meds, labs, imaging, procedures, immunizations, and order sets
- [ ] **5.3** Implement order set application via `PlanDefinition/$apply`
- [ ] **5.4** Display placed orders in chart

## Phase 6 — Disposition and tenant configuration

- [ ] **6.1** Create `Basic` tenant config resource for disposition toggle + `ValueSet` reference
- [ ] **6.2** Build admin UI to toggle disposition and edit disposition list
- [ ] **6.3** Wire `Questionnaire.enableWhen` to hide/show disposition item based on tenant config
- [ ] **6.4** Extract disposition answer to `Encounter.hospitalization.dischargeDisposition`

## Phase 7 — Clinical decision flows

- [ ] **7.1** Create 1–2 sample decision-flow `Questionnaire`s
- [ ] **7.2** Add Clinical Decision Flows dropdown to chart
- [ ] **7.3** Render selected decision flow inline and extract responses

## Phase 8 — Signing and final document

- [ ] **8.1** Confirm Sign / Sign & Close creates `Provenance` and sets `ClinicalImpression.status` = `completed`
- [ ] **8.2** Optional: generate `Composition` referencing all extracted resources

## Phase 9 — Polish and scale

- [ ] **9.1** Add loading/error states to chart sections
- [ ] **9.2** Support multiple visit types beyond Sick Call
- [ ] **9.3** Tenant-scope questionnaires and order sets per organization
- [ ] **9.4** End-to-end test with synthetic patients from `hiivecare-dev-data-pipeline`
