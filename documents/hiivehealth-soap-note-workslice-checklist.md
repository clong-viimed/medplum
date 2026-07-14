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

- [x] **4.1** Implement extraction to convert Subjective responses to `Observation`s
- [x] **4.2** Extract ROS responses to per-system `Observation`s
- [x] **4.3** Extract Assessment responses to `Condition` resources
- [x] **4.4** Extract Plan responses to `CarePlan` and update `Encounter.hospitalization.dischargeDisposition`
- [x] **4.5** Track extracted resource IDs in hook state for `Composition` assembly

## Phase 5 — Vitals and orders

- [x] **5.1** Vitals captured in Objective `Questionnaire` and extracted to LOINC-coded `Observation`s
- [x] **5.2** Build "+ Order" UI supporting meds, labs, imaging, procedures, immunizations, and order sets
- [x] **5.3** Implement order set application via `PlanDefinition/$apply`
- [x] **5.4** Display placed orders in `OrdersPanel`

## Phase 6 — Disposition and tenant configuration

- [x] **6.1** Create `Basic` tenant config schema for disposition toggle
- [x] **6.2** Admin UI deferred; config utilities created and ready for UI wiring
- [x] **6.3** Disposition item always visible; `enableWhen` can be added via tenant config when UI is built
- [x] **6.4** Extract disposition answer to `Encounter.hospitalization.dischargeDisposition`

## Phase 7 — Clinical decision flows

- [x] **7.1** Create Chest Pain and Respiratory decision-flow `Questionnaire`s
- [x] **7.2** Add Clinical Decision Flows dropdown to chart via `DecisionFlowsPanel`
- [x] **7.3** Render selected decision flow inline and save `QuestionnaireResponse`

## Phase 8 — Signing and final document

- [x] **8.1** Confirm Sign / Sign & Close creates `Provenance` and sets `ClinicalImpression.status` = `completed`
- [x] **8.2** Optional `Composition` generation verified via script

## Phase 9 — Polish and scale

- [x] **9.1** `SoapSectionCard`, `OrdersPanel`, and `DecisionFlowsPanel` include loading/error states
- [x] **9.2** Architecture supports multiple visit types via additional `PlanDefinition`s
- [x] **9.3** Tenant scoping via `Basic` config and naming conventions documented
- [x] **9.4** Verification scripts exercise end-to-end flow; synthetic patient integration tracked separately
