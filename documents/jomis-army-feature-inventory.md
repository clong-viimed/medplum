# JOMIS / Army Functionality Inventory For Medplum Rebuild

## Purpose

This document captures the Army and military-adjacent functionality identified from legacy OpMed CDP RAC documentation and translates it into a Medplum rebuild inventory.

This is a first-pass source-driven inventory, not a final solution design. The goal is to identify what the old platform actually did, separate Medplum-native capabilities from custom build work, and create a working backlog for the rebuild.

## Source Documents Reviewed

Primary legacy sources reviewed in this pass:

- OpMed CDP RAC System Administration Manual, version 1.25, dated 2024-03-15
- OpMed CDP RAC System User Manual, version 1.21, dated 2024-03-15
- RAC Student Guide, version 1.11
- RAC Curriculum, version 1.14
- RAC Instructor Guide, version 1.14

Supporting derived sources already available on the desktop:

- JOMIS Medplum Backlog
- JOMIS Requirements Checklist
- JOMIS Executive Summary

## How To Read This

- `Medplum-native`: can be implemented mostly with core Medplum resources, project config, questionnaires, bots, access policies, and normal React app work.
- `Custom`: requires new UI, workflow logic, decision engine behavior, special printing, external integrations, or significant domain extensions.
- `Hybrid`: Medplum provides the data model and access layer, but the workflow still needs meaningful custom application work.

## High-Level Feature Areas

### 1. Government Access, Authentication, And Security Controls

Legacy functionality identified:

- Usage consent / government warning banner shown before login.
- CAC login flow in addition to username or email login.
- Multiple operational roles including Medic, Nurse, Provider, IDEP, Pharmacy Tech, Lab Tech, Radiology Tech, Patient Admin, Supply Tech, Environmental Admin, and System Admin.
- Role-scoped UI and permissions.
- Locked account management.
- Password management and password reset tooling.
- Audit-oriented operational posture with logs and admin troubleshooting.

What Medplum can cover:

- `ProjectMembership`, `Practitioner`, `PractitionerRole`, `Organization`, and `AccessPolicy` cover identity and role scoping.
- External IdP integration can support CAC or CAC-brokered authentication.
- `AuditEvent` covers core audit logging.

What likely needs custom build work:

- Government disclaimer interstitial and session acceptance flow.
- CAC-specific user experience and identity mapping rules.
- Fine-grained role-driven navigation and action visibility across the app.
- Admin UI for locked-account handling and org-level password policy controls.

Medplum rebuild slice:

- Build a pre-auth warning/consent screen.
- Define role-specific `AccessPolicy` resources.
- Add a role-aware shell/navigation layer.
- Integrate CAC through enterprise OIDC/SAML broker rather than direct smart-card logic inside Medplum.

### 2. Military And Agency-Specific Patient Identity / Demographics

Legacy functionality identified:

- Patient search by name, DOB, and DoD ID.
- Configurable org-specific demographics.
- Army/DoD fields such as DoD ID, blood type, affiliation, branch of service, grade, and UIC.
- Support for alternate agency demographics such as alien number and nationality.
- Editing patient demographics after initial creation.
- Merge and unmerge patient records.
- Fast patient creation from CAC barcode or scanned input.

What Medplum can cover:

- `Patient.identifier`, `Patient.contact`, `Patient.extension`, and `RelatedPerson`.
- Search over identifiers and demographic fields.
- Standard CRUD for patient maintenance.

What likely needs custom build work:

- Org-configurable demographic form builder.
- Merge/unmerge UX and governance rules.
- Barcode/CAC demographic ingestion.
- Domain-specific extension definitions for Army and agency identity fields.

Medplum rebuild slice:

- Use `Patient.identifier` for stable identifiers and FHIR extensions for military-only fields.
- Drive the intake form from `Questionnaire` plus org config.
- Implement merge/unmerge as privileged admin workflows with strong audit requirements.

### 3. Unknown Patient And Rapid Intake Workflows

Legacy functionality identified:

- One-click unknown patient workflow.
- Immediate creation of encounter from unknown patient flow.
- Later identity reconciliation without losing encounter continuity.

What Medplum can cover:

- `Patient` plus `Encounter` creation.
- `Provenance` and `AuditEvent` for tracking later identity reconciliation.

What likely needs custom build work:

- Fast-entry UI optimized for field or clinic use.
- Temporary naming and MRN generation conventions.
- Merge/reconciliation workflow into a known patient identity.

Medplum rebuild slice:

- Bot-backed `createUnknownPatientAndEncounter` action.
- Follow-up admin or registration workflow to reconcile the temporary patient into a known identity.

### 4. Patient Chart And Longitudinal Record

Legacy functionality identified:

- Patient record summary page.
- PAMPI-style view of problems, allergies, medications, vitals, immunizations, and procedures.
- Problem list with linked complaints and ability to add known or free-text diagnoses.
- Allergy tracking with multiple reactions and severity.
- Medication list with active/inactive views and interaction checking.
- Vitals trend/history and last-known values.
- Immunization history.
- Procedure history.
- Psychosocial history.
- Family history.
- Cases and encounters view with encounter history and case grouping.

What Medplum can cover:

- `Condition`, `AllergyIntolerance`, `MedicationRequest`, `MedicationStatement`, `Observation`, `Immunization`, `Procedure`, `FamilyMemberHistory`, `Encounter`, `EpisodeOfCare`, and `DocumentReference`.

What likely needs custom build work:

- PAMPI summary layout.
- Case grouping semantics if `EpisodeOfCare` is not a direct fit.
- Medication interaction checking if not delegated to an external drug knowledge source.
- Complaint-to-diagnosis linkage UX.

Medplum rebuild slice:

- Start with a custom patient summary page backed by standard FHIR search queries.
- Represent cases with `EpisodeOfCare` unless a stricter custom abstraction proves necessary.
- Leave interaction checking as a separate integration decision.

### 5. Encounters, Visit Types, And SOAP Documentation

Legacy functionality identified:

- Multiple visit modalities: in-person, video, and phone.
- Multiple visit durations and specialties under visit types.
- Quick Visit initiation from patient record.
- Open, closed, and amended encounters.
- Encounter note panel with Subjective, Objective, Assessment, and Plan structure.
- Documentation callouts tied to appointment type.
- Auto-save during encounter.
- Chief complaint selection when multiple complaints exist.
- Checklists per encounter type.
- No discharge action for phone or video visits.
- Sign and Close plus Discharge workflow.
- Encounter report view.

What Medplum can cover:

- `Encounter`, `Appointment`, `Questionnaire`, `QuestionnaireResponse`, `DocumentReference`, `Composition`, `Task`.

What likely needs custom build work:

- Operational encounter workspace.
- Role-aware SOAP editing rules.
- Encounter-type-specific checklist engine.
- Auto-save behavior and encounter report rendering.
- Visit-type-specific UI constraints such as discharge suppression on phone/video.

Medplum rebuild slice:

- Represent the note with structured FHIR resources plus a generated encounter summary.
- Use `Questionnaire` for encounter-type-specific data capture blocks.
- Use a custom encounter shell to unify queue, note, checklist, orders, and algorithm workflow.

### 6. Clinical Decision Support: ADTMC / Army Algorithms

Legacy functionality identified:

- Searchable Clinical Decision Flow assignment from encounter.
- Army ADTMC screening tool with branching yes/no logic.
- Red flag screening upfront.
- Four disposition outcomes documented in the legacy workflow, including Provider Now, IDEP Now, Specialty Referral, and Minor Care Protocols.
- Auto-signed medic/nurse encounter state when algorithm completes.
- Auto-forwarding active encounter into provider queue after algorithm completion.
- Suggested resolutions based on algorithm input.
- Supplemental PDFs, full algorithm PDFs, MEDCOM references, and training documents attached to the workflow.
- Expression scoring and expression summaries saved into encounter context.
- MCP selection popup when applicable.

What Medplum can cover:

- `Questionnaire` and `QuestionnaireResponse` can model branching clinical flows.
- `Task` can model routing into provider queues.
- `DocumentReference` can attach source PDFs and reference materials.

What likely needs custom build work:

- Algorithm authoring/import pipeline for the Army source content.
- Rich branching UI with outcome-specific logic.
- Auto-sign, queue-forwarding, and role-handoff orchestration.
- Expression scoring framework.
- Optional import/transformation of existing PDF logic into structured flow definitions.

Medplum rebuild slice:

- Treat ADTMC as one of the highest custom-build areas.
- Store algorithm definitions in a structured format and render them in a custom decision engine UI.
- Use Bots to finalize outcome side effects like signing, task creation, and provider routing.

### 7. Provider Assessment, Diagnosis, And Plan

Legacy functionality identified:

- Providers claim encounters from priority queue.
- Providers review medic-entered data and complete assessment/plan.
- Differential diagnoses with ability to mark primary diagnosis or ruled-out diagnoses.
- Ability to add prior diagnoses.
- Plan section tied to diagnosis.

What Medplum can cover:

- `Condition`, `Encounter`, `Task`, `Practitioner`, `Provenance`.

What likely needs custom build work:

- Provider-specific encounter workspace.
- Differential diagnosis management UX.
- Auto-linking active diagnosis into downstream orders.

Medplum rebuild slice:

- Model final diagnosis as `Condition` and capture differential set either as additional `Condition` resources or encounter-scoped structured note data.
- Use provider queue claims through `Task` or encounter assignment semantics.

### 8. Orders, Order Sets, And Ancillary Queues

Legacy functionality identified:

- Orders for medications, labs, immunizations, procedures, and imaging.
- Persistent order button in encounter.
- Order priority of STAT or Routine.
- Favorite order sets.
- Separate technician workflows for radiology, pharmacy, and lab.
- Open encounters and task queues for technicians.
- Completed technician work returns encounter to submitting clinician.

What Medplum can cover:

- `MedicationRequest`, `ServiceRequest`, `ImmunizationRecommendation` or administration records where appropriate, `Task`, `DiagnosticReport`, `Observation`, `ProcedureRequest` pattern via `ServiceRequest`.

What likely needs custom build work:

- Order set authoring and favoriting UX.
- Technician queue dashboards.
- Routing and state machine behavior for ancillary completion.
- Imaging-specific workflow if radiology is part of phase one.

Medplum rebuild slice:

- Build orders on `MedicationRequest` and `ServiceRequest`.
- Represent work queues with `Task`.
- Store reusable order sets as configurable templates, likely backed by `PlanDefinition`, `ActivityDefinition`, or custom config records.

### 9. Pharmacy Fulfillment

Legacy functionality identified:

- Pharmacist or pharmacy tech sees pending medication queue.
- Marks medication orders as filled.
- Pill bottle label printing was part of the target workflow.
- No outbound retail e-prescribing in the Army/DoD model.

What Medplum can cover:

- `MedicationRequest`, `MedicationDispense`, `Task`.

What likely needs custom build work:

- Dispense queue UI.
- Label-print generation.
- Inventory-aware fulfillment if medication stock is in scope.

Medplum rebuild slice:

- Use `MedicationDispense` plus task state transitions.
- Keep e-prescribe out of the initial Army rebuild unless a non-DoD deployment requires it later.

### 10. Scheduling, Dashboard Queues, And Care Assignment

Legacy functionality identified:

- Dashboard with open encounters and user queue.
- Priority encounters sorted by priority and time in queue.
- Today's visits.
- Scheduled visits.
- CareFlow tasks and filters.
- My Patients list.
- CareTeams.
- Queue filters configurable by admin.
- Assign-to and group-to-queue routing logic.

What Medplum can cover:

- `Appointment`, `Encounter`, `Task`, `CareTeam`, `PractitionerRole`, `Group`.

What likely needs custom build work:

- Queue filter builder.
- Operational dashboard tailored to Army workflows.
- Routing logic that maps algorithm outcomes, roles, locations, and specialties into queues.

Medplum rebuild slice:

- Build queueing on top of `Task`.
- Treat queue filter configuration as a first-class admin feature, not hardcoded app logic.

### 11. Forms, Printouts, And Operational Outputs

Legacy functionality identified:

- Encounter report view.
- Form generation and printing from encounter context.
- SF600 generation.
- DD689, DD2808, DD2807-1, and DD2992 listed in the system overview.
- Duty/profile slip generation.
- Print-to-PDF workflows.
- CUI/sensitive warnings on printouts and PDFs.

What Medplum can cover:

- `DocumentReference`, `Binary`, `Composition`, `QuestionnaireResponse`, `DiagnosticReport`.

What likely needs custom build work:

- Government-form layout rendering.
- Print/PDF pipeline.
- CUI marking rules on exports.

Medplum rebuild slice:

- Generate encounter-derived printable forms from structured FHIR data.
- Treat military form rendering as a dedicated output module.

### 12. QR Import / Export And Field Interoperability

Legacy functionality identified:

- Read QR code for encounter transfer.
- Read animated QR codes from BATDOC or TAC.
- Generate QR code for encounter export.
- Webcam and scanner-oriented UX.
- CAC barcode-based patient add flow.

What Medplum can cover:

- Underlying data exchange resources.

What likely needs custom build work:

- QR serialization/deserialization format.
- Scanner workflows and progress handling.
- Import reconciliation and validation logic.

Medplum rebuild slice:

- Treat QR interoperability as custom field-transfer infrastructure.
- Confirm whether the legacy QR payload format must be preserved or can be replaced.

### 13. Environmental Health Modules

Legacy functionality identified:

- Water source management.
- Water test routes.
- Water test entry and result review.
- Water reports and trend views.
- Pest management dashboard.
- Pesticide treatment logging.
- Applicator certification tracking.
- Inspection logging.
- Platform sanitation certificates.
- Pest material inventory.
- Technical assist records.
- Pest routes.
- Heat stress dashboard.
- Heat stress route management.
- Named-space and unnamed-space heat stress logs.
- Heat stress result review and reports.
- Environmental inventory, including assignment of inventory items to personnel.

What Medplum can cover:

- Core FHIR does not directly model most of this domain cleanly.
- Some pieces can fit into `Location`, `Device`, `Observation`, `Specimen`, `Task`, `SupplyDelivery`, or custom profiles/extensions.

What likely needs custom build work:

- This is a major custom domain module.
- Domain data model for environmental assets, routes, tests, certifications, and inventories.
- Floor-plan and route UX.
- Time-series reporting views.

Medplum rebuild slice:

- Keep environmental health as a separate bounded context within the Medplum platform.
- Use Medplum for auth, audit, tenancy, and possibly observations/documents, but expect substantial custom data modeling and UI.

### 14. Facility, Deployment, And Org Configuration

Legacy functionality identified:

- Organization management.
- Divisions.
- Locations.
- Deployments.
- Structures.
- Rooms and beds/location contents.
- Water sources attached to structure/location hierarchy.
- Care team configuration.
- Staff management.
- Enabled actions by deployment or role.
- Queue filters.
- Reports access.
- Inventory management.

What Medplum can cover:

- `Organization`, `Location`, `Practitioner`, `PractitionerRole`, `CareTeam`, `Group`, `ValueSet`, `PlanDefinition`, `Schedule`.

What likely needs custom build work:

- Admin screens for deployment structure and enabled-action configuration.
- Fine-grained no-code admin tooling for visit types, routing, checklists, and role capabilities.
- Room/bed/facility hierarchy management beyond generic FHIR editors.

Medplum rebuild slice:

- This should become a dedicated admin console.
- Prefer configuration records over hardcoded workflow toggles.

### 15. System Operations And Deployment Concerns

Legacy functionality identified:

- Backup and restore of the entire local RAC database.
- Desktop-installed and potentially disconnected operational model.
- Local logs and troubleshooting guidance.

What Medplum can cover:

- Cloud-hosted Medplum changes the operating model significantly.

What likely needs custom build work:

- Any true offline-first workflow.
- Site-level backup/export procedures if disconnected deployments remain a requirement.

Medplum rebuild slice:

- Treat offline or low-connectivity support as a separate architecture decision, not an incidental feature.

## Army-Specific Features That Are Not Just Generic EHR Work

These appear to be the most distinct Army or military operational requirements and should be treated as explicit rebuild tracks:

1. CAC login and government warning/consent screen.
2. DoD-specific demographics and identifiers, including DoD ID, branch, grade, and UIC.
3. ADTMC algorithm engine and disposition routing.
4. Minor Care Protocol and specialty referral workflow behavior.
5. Army forms such as SF600 and related military print artifacts.
6. QR-based field interoperability with BATDOC/TAC-style workflows.
7. Environmental health modules: water, pest, heat stress, route management, and associated reporting.
8. Deployment/structure/location modeling for military operational environments.

## Likely Build Priority For Medplum

### Phase 1: Core Army Clinical MVP

- Government access flow and role-based auth
- Army demographics and patient identity
- Unknown patient intake
- Patient chart
- Encounter workspace and SOAP workflow
- ADTMC decision engine
- Provider queue and completion workflow
- Orders, pharmacy, lab, and radiology queues
- Military forms and encounter reporting
- Minimum admin configuration required to operate the clinical workflows

### Phase 2: Deferred Operational Extensions

- QR field-transfer workflows
- Water module
- Pest module
- Heat stress module
- Environmental inventory assignment
- Offline/disconnected architecture if still required
- Expanded admin configurability beyond the MVP operating baseline

## Medplum Fit Assessment

Best fit for Medplum-native implementation:

- Identity and role resources
- Patient longitudinal record
- Encounters and appointments
- Clinical documentation primitives
- Orders and queue tasks
- Audit and provenance
- Forms/questionnaires

Highest custom-build areas:

- ADTMC algorithm runtime and content ingestion
- Military PDF/form generation
- No-code admin configuration surface
- QR field-transfer workflows
- Environmental health modules
- Disconnected/offline deployment support

## Estimation Assumptions

This estimate assumes:

- 2 strong full-stack developers working mostly full time
- heavy use of context engineering for requirements synthesis, code generation, scaffolding, and test support
- Medplum is used as the core FHIR platform rather than building a new backend
- CAC is implemented through an existing enterprise identity broker
- the MVP excludes QR field transfer, environmental modules, and offline behavior
- the MVP still includes Army-specific clinical workflow fidelity, including ADTMC, queueing, and military forms
- no separate dedicated QA, product, or UX headcount is assumed; that risk stays inside the range

Acceleration assumptions for the revised estimate below:

- Medplum API documentation is fully available.
- Legacy RAC/JOMIS manuals are available and already reviewed.
- The prior EHR source code exists and can be used for behavior reference immediately.
- The prior EHR source code has not yet been audited for direct portability, so the revised ranges assume `reference-first reuse`, not guaranteed lift-and-shift reuse.
- If legacy assets include structured ADTMC logic, print templates, and routing/state definitions, some slices may outperform the revised range.

## Slice-By-Slice Effort Estimate

The ranges below are elapsed implementation ranges for a 2-developer team. Several slices can overlap, but not all of them. The main schedule constraint is the custom workflow spine: auth/roles, encounter workspace, ADTMC, queue routing, and forms.

### Phase 1: Core Army Clinical MVP

| Slice | Scope | Medplum Fit | Base 2 Dev Range | Revised 2 Dev Range | Base 4 Dev Range | Revised 4 Dev Range | Likely Asset Acceleration | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Government access, auth, CAC broker integration, role-based access shell | Hybrid | 2-4 weeks | 2-3 weeks | 1.5-3 weeks | 1.5-2.5 weeks | Low to Medium | Legacy code helps with role behavior and warning-screen parity more than CAC itself |
| 2 | Army demographics, identifiers, patient search, configurable intake model | Hybrid | 2-4 weeks | 1.5-3 weeks | 1.5-3 weeks | 1-2.5 weeks | Medium | Existing field definitions and prior patient screens should reduce discovery time |
| 3 | Unknown patient rapid intake and identity reconciliation baseline | Hybrid | 1-2 weeks | 1-1.5 weeks | 1-1.5 weeks | 0.75-1.25 weeks | Medium | Good legacy flow examples should keep this small |
| 4 | Patient chart and longitudinal record views | Hybrid | 3-5 weeks | 2.5-4 weeks | 2-4 weeks | 2-3.5 weeks | Medium | Legacy chart layout and section behavior reduce product/design churn |
| 5 | Encounter workspace, SOAP note model, visit types, checklists, autosave, discharge/sign-close | Custom | 5-8 weeks | 4-6.5 weeks | 4-7 weeks | 3.5-5.5 weeks | Medium | Prior workflow code and screen behavior should reduce iteration but not remove major UI work |
| 6 | ADTMC engine, branching runtime, disposition outcomes, provider routing side effects | Custom | 8-14 weeks | 6-11 weeks | 6-12 weeks | 5-9 weeks | Medium to High | Biggest gain if prior logic is structured; smaller gain if only PDFs and imperative UI code exist |
| 7 | Provider queue, claim workflow, diagnosis, plan, differential management | Custom | 3-5 weeks | 2.5-4 weeks | 2-4 weeks | 2-3.5 weeks | Medium | Legacy routing and provider workflow logic should help materially |
| 8 | Orders, order sets, technician queues, lab/radiology/pharmacy task routing | Hybrid | 4-7 weeks | 3-5.5 weeks | 3-5.5 weeks | 2.5-4.5 weeks | Medium | Existing order flow and queue logic should compress behavior discovery |
| 9 | Pharmacy fulfillment and label-print baseline | Hybrid | 2-4 weeks | 1.5-3 weeks | 1.5-3 weeks | 1.5-2.5 weeks | Medium | Existing label content and fulfillment states matter more than Medplum docs |
| 10 | Military forms and encounter reporting outputs | Custom | 4-7 weeks | 3-5.5 weeks | 3-6 weeks | 2.5-4.5 weeks | Medium to High | Big acceleration if old templates and field maps are directly reusable |
| 11 | Minimum admin console to operate the MVP | Hybrid | 3-5 weeks | 2.5-4 weeks | 2-4 weeks | 2-3.5 weeks | Low to Medium | Legacy admin surfaces clarify requirements but still need redesign in Medplum |
| 12 | End-to-end hardening, test coverage, bug fixing, pilot readiness | Custom | 4-6 weeks | 3.5-5.5 weeks | 3-5 weeks | 3-4.5 weeks | Low | Documentation and old code help, but integration QA remains real work |

### Phase 1 2-Developer Range

- Best credible range: 24-34 weeks
- More conservative range: 30-40 weeks

### Phase 1 Revised 2-Developer Range With Legacy Asset Leverage

- Best credible range: 18-28 weeks
- More conservative range: 22-32 weeks

### Phase 1 4-Developer Range

- Best credible range: 16-26 weeks
- More conservative range: 18-30 weeks

### Phase 1 Revised 4-Developer Range With Legacy Asset Leverage

- Best credible range: 12-22 weeks
- More conservative range: 14-26 weeks

Interpretation:

- The lower end assumes the old code is good enough to resolve behavior quickly in ADTMC, queue routing, and forms.
- The upper end assumes the old code is useful as reference but still requires substantial redesign for Medplum.
- If the old code turns out to contain structured rule assets for ADTMC and reusable print/form mappings, the revised range could improve again by a few weeks.

Reason the total is not just the sum of the rows:

- slices 2, 3, 4, and part of 11 can overlap
- slices 7, 8, and 10 can begin before slice 6 fully ends, once the encounter data contract stabilizes
- slice 12 compresses or expands depending on how volatile the ADTMC and forms work turns out to be

### Phase 2: Deferred Extensions

| Slice | Scope | Medplum Fit | Base 2 Dev Range | Revised 2 Dev Range | Base 4 Dev Range | Revised 4 Dev Range | Likely Asset Acceleration | Notes |
|---|---|---|---|---|---|---|---|---|
| 13 | QR field-transfer workflows, scanner UX, import/export payload handling | Custom | 4-7 weeks | 3-5.5 weeks | 3-6 weeks | 2.5-4.5 weeks | Medium to High | Strong gain if legacy QR payloads and scanner behavior are already well understood |
| 14 | Water module | Custom | 5-8 weeks | 4-6.5 weeks | 4-7 weeks | 3.5-5.5 weeks | Medium | Old forms, fields, and report logic should reduce modeling ambiguity |
| 15 | Pest module | Custom | 5-8 weeks | 4-6.5 weeks | 4-7 weeks | 3.5-5.5 weeks | Medium | Broad custom area, but behavior reuse should help |
| 16 | Heat stress module | Custom | 3-5 weeks | 2.5-4 weeks | 2-4 weeks | 2-3.5 weeks | Medium | Smaller custom domain with likely reusable forms and reports |
| 17 | Environmental inventory and assignment workflows | Hybrid | 2-4 weeks | 1.5-3 weeks | 1.5-3 weeks | 1.5-2.5 weeks | Medium | Likely to benefit from existing workflows and field definitions |
| 18 | Offline/disconnected architecture and sync model | Custom | 8-16 weeks | 7-14 weeks | 6-12 weeks | 5.5-10.5 weeks | Low to Medium | Old implementation may clarify requirements but is unlikely to port cleanly |
| 19 | Expanded admin configurability and no-code operations layer | Custom | 4-8 weeks | 3-6.5 weeks | 3-6 weeks | 2.5-5 weeks | Medium | Legacy admin semantics help but do not eliminate platform redesign |

### Phase 2 2-Developer Range

- Without offline/disconnected support: 19-32 weeks
- With offline/disconnected support: 28-46 weeks

### Phase 2 Revised 2-Developer Range With Legacy Asset Leverage

- Without offline/disconnected support: 15-25 weeks
- With offline/disconnected support: 22-39 weeks

### Phase 2 4-Developer Range

- Without offline/disconnected support: 12-22 weeks
- With offline/disconnected support: 18-34 weeks

### Phase 2 Revised 4-Developer Range With Legacy Asset Leverage

- Without offline/disconnected support: 10-18 weeks
- With offline/disconnected support: 15-28 weeks

## Native Vs Custom Summary

Mostly Medplum-native or Medplum-favorable:

- core identity resources
- role assignment and access policies
- patient and clinician FHIR records
- encounter, appointment, and task resources
- clinical resources for chart and ordering
- audit/provenance foundation
- questionnaire-backed structured capture

Mostly custom application work:

- Army-specific encounter workspace UX
- ADTMC decision runtime and content transformation
- role-specific dashboard and queue orchestration
- military form rendering and print outputs
- QR transfer workflows
- environmental health modules
- offline/disconnected behavior
- broad no-code admin configurability layer

## Critical Path For The MVP

These slices determine the actual delivery pace. If any of them slip, the MVP slips.

1. Government access, auth, and role model
2. Encounter workspace and SOAP data contract
3. ADTMC runtime and disposition side effects
4. Provider queue and task routing
5. Orders embedded into encounter workflow
6. Military forms and encounter report outputs
7. End-to-end hardening across the full medic to provider to ancillary path

Practical dependency chain:

- slice 1 must stabilize before role-specific workflow testing is meaningful
- slice 5 is the foundation for slices 6, 7, 8, and 10
- slice 6 drives a large portion of the queue, routing, and sign-off behavior
- slice 10 cannot finalize until encounter data structure and output expectations stabilize
- slice 12 expands quickly if slices 5 and 6 churn late

## Staffing Summary

### 2-Developer Recommendation

For the scope you just set, the most realistic planning number for a 2-developer team is:

- Phase 1 Army clinical MVP: 6-9 months
- Phase 2 without offline: add 5-8 months
- Phase 2 with offline: add 7-11 months

With the currently known acceleration inputs, a more aggressive but still credible planning number is:

- Phase 1 Army clinical MVP: 4.5-7.5 months
- Phase 2 without offline: add 3.5-6 months
- Phase 2 with offline: add 5-9 months

That puts full delivery at:

- MVP only: roughly 24-40 weeks
- MVP plus deferred phase 2, excluding offline: roughly 43-72 weeks total
- MVP plus deferred phase 2, including offline: roughly 52-86 weeks total

### 4-Developer Recommendation

Adding developers helps, but not linearly. This program still has a strong dependency spine around encounter modeling, ADTMC, routing, and military form outputs. A 4-developer team can compress elapsed time meaningfully, but coordination and integration costs also increase.

Assumed 4-developer split:

- developer 1: patient chart and encounter workspace
- developer 2: ADTMC engine and routing logic
- developer 3: orders, ancillary queues, and forms/reporting
- developer 4: auth, roles, admin configuration baseline, and cross-cutting integration support

### Practical 4-Developer Planning Number

- MVP only: roughly 3-5 months
- MVP plus phase 2 without offline: roughly 5.5-9 months total
- MVP plus phase 2 with offline: roughly 7-12 months total

### Why 4 Developers Does Not Cut The Schedule In Half

- ADTMC still defines a large portion of downstream queue and encounter behavior.
- The encounter data contract must stabilize before multiple feature tracks can move safely in parallel.
- Forms and output fidelity depend on stable encounter structure and workflow completion rules.
- End-to-end testing across medic, provider, ancillary, and admin workflows remains elapsed-time heavy.
- More developers improve throughput, but they also create more integration overhead.

### 4-Developer Risk Notes

- If ADTMC source assets are only PDFs or UI-bound old code, the 4-developer benefit compresses less than expected.
- If military forms require exact fidelity and many exception paths, reporting/output can stay on the critical path longer.
- If role and routing semantics are not locked early, additional developers can create parallel rework rather than acceleration.

## Initial Open Questions

1. Which Army workflows are mandatory for phase one versus acceptable to defer?
2. Do we need full parity with the legacy QR payload format, or only equivalent transfer capability?
3. Are the ADTMC algorithms available in a structured source format, or only PDF/manual artifacts?
4. Do the environmental modules need to launch with the clinical rebuild, or can they be isolated as a later module?
5. Is true offline operation still a program requirement, or was it only required for the Windows deployment model?
6. Do Army forms need exact form fidelity, or is clinically equivalent structured export acceptable in early phases?

## Recommended Next Documentation Pass

The next pass should convert this inventory into a traceable matrix with one row per feature:

- Legacy feature
- Source document and section
- Role/persona
- Medplum resource mapping
- UI module
- Workflow automation needed
- Integration dependency
- Priority
- Build phase
- Open questions

That matrix should become the canonical backlog input for implementation planning.