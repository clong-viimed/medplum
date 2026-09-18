# California HIE / Smile Clinical Viewer Demo Implementation Plan

## Purpose

Build a focused HiiveCare clinical-viewer demonstration for California HIE and Smile Digital Health. Smile is the clinical data repository (CDR) partner; HiiveCare is the clinician-facing viewer. Analytics and reporting are delivered by a separate platform.

The demo must provide screenshot-ready proof of the following Hiive-owned capabilities:

1. A longitudinal clinical viewer with patient search, aggregated and source-specific records, clinical summaries, clinical navigation, detailed data, documents, alerts, filtering, printing, and export.
2. Audit logging for patient-record activity and viewer export/print actions.
3. A clearly scoped handoff to the separate analytics platform, whose owner supplies the requested reporting-and-analytics screenshots.

## Scope Boundary

### In Scope

- California-branded synthetic FHIR data and representative clinical documents.
- Provider clinical viewer workflows and screenshot states.
- App-generated audit events and an audit-report view.
- Evidence pack mapping HiiveCare viewer screenshots to Smile's clinical-viewer bullet.
- A cross-platform evidence checklist identifying the analytics-platform screenshots required for Smile's reporting-and-analytics bullet.

### Explicitly Out of Scope for This Demo

- Integration with MX identity, SSO, user organization/role/population claims.
- Integration with Smile governance services or live authorization decisions.
- Live Smile CDR connectivity, production data ingestion, MPI, notification delivery, and outbound exchange.
- Analytics dashboards, dashboard publishing, drill-down, scheduled/ad hoc reports, population analysis, natural-language analytics, and analytics-platform audit logging.

The demo must label source and access behavior accurately. It demonstrates HiiveCare as the consumer-facing viewer layer, using representative FHIR data. It must not claim live Smile or governance integration.

## Target Demo Experience

### Clinical Viewer

The clinician signs in to a California HIE-branded HiiveCare Provider Portal, searches a patient, and opens an aggregated longitudinal record. The record has a source selector that switches between all sources and individual contributing organizations. It exposes a concise clinical summary, alert strip, and section navigation for problems, medications, allergies, labs, encounters, coverage/care programs, documents, and SDOH.

The clinician can filter and sort content, open a structured detail view, view an embedded C-CDA or PDF, print a selected patient summary, and export a selected data subset. Every patient search, chart opening, document viewing, print/export action, and filter action produces a queryable audit record.

### Analytics Handoff

At the end of the viewer walkthrough, the presenter identifies the separate analytics platform as the reporting and analytics experience. The HiiveCare viewer does not embed, host, or claim ownership of that platform's dashboards. The analytics team provides a separate screenshot package covering configurable/published dashboards, drill-down, scheduled and ad hoc reports, population analysis, AI-assisted analytics, and its associated audit controls.

## Demo Data Contract

Create a California demonstration cohort of 12 to 20 patients, including at least:

- Three source organizations, each with an organization identifier and source-specific patient identifier.
- One longitudinal patient with records from all three sources.
- One patient with a critical allergy and abnormal result for alert evidence.
- One patient enrolled in a CalAIM-like care program with active and historical coverage.
- One patient with SDOH observations for housing, food, or transportation need.
- C-CDA and PDF `DocumentReference` examples linked to at least two patients.
- Conditions, medications, allergies, observations, encounters, immunizations, procedures, coverage, care-team, and contact data sufficient for every viewer section.

Use standard FHIR R4 resources wherever possible: `Patient`, `Organization`, `Encounter`, `Condition`, `AllergyIntolerance`, `MedicationRequest`, `Observation`, `DiagnosticReport`, `Procedure`, `Immunization`, `Coverage`, `CarePlan`, `CareTeam`, `RelatedPerson`, `DocumentReference`, `Binary`, `Provenance`, and `AuditEvent`.

## Work Slices

### Slice 1: California Demo Foundation

**Deliverable:** A distinct California demo configuration and synthetic FHIR cohort that does not alter the Nevada demo.

- Create California organizations, source identifiers, provider personas, and a demo project/configuration boundary.
- Seed the clinical cohort and documents defined in the demo data contract.
- Add deterministic named patients for the walkthrough and reusable screenshots.
- Add an idempotent seed/reset command and a data-readiness check.

**Verification criteria:**

- Seed can be run twice without duplicate resources.
- Readiness check reports every required FHIR resource type and named scenario patient.
- Nevada resources and scripts remain unchanged.

### Slice 2: Longitudinal Clinical Viewer

**Deliverable:** California-branded patient search and longitudinal chart view.

- Extend patient search with demographic fields, identifier plus source-organization exact search, recent patients, and record-availability/source indicators.
- Add an aggregated/single-source toggle and make its active source visible in the chart header.
- Build a clinical summary with allergies, abnormal results, active conditions, current medications, recent encounters, coverage, care-program status, and SDOH.
- Add section navigation, count/data indicators, sorting, and in-section filtering.
- Add structured detail panes for clinical data classes and contacts/next of kin.

**Verification criteria:**

- A user can find the longitudinal scenario patient using demographic and identifier searches.
- Switching source modes changes the visible result set without changing the patient identity.
- Each required section has a screenshot-ready state with representative data.

### Slice 3: Alerts, Documents, Print, and Export

**Deliverable:** Evidence of clinical safety signals and document/data sharing actions.

- Display non-decorative alert indicators for critical allergy and abnormal result scenarios.
- Embed C-CDA and PDF `DocumentReference` viewing inside the patient chart.
- Implement a selectable patient-summary print view.
- Implement selectable export for patient-summary PDF and FHIR/C-CDA output only where the backend operation supports it; otherwise label the output as demo-generated and do not call it native C-CDA export.
- Capture audit records for document view, print, and export.

**Verification criteria:**

- The critical-alert patient shows clear alerts before a section is opened.
- C-CDA and PDF documents open from the chart without leaving the portal.
- Print and export show selected data classes and generate an auditable event.

### Slice 4: Viewer Audit Trail and Evidence Pack

**Deliverable:** Auditable activity plus a screenshot package for Smile.

- Create an audit dashboard for patient searches, chart views, document views, exports, and print actions.
- Add filters for actor, patient/resource, action, date range, and source organization where available.
- Export the audit report to CSV.
- Capture labeled screenshots for each Smile scope bullet and a concise capability matrix with screenshot references.

**Verification criteria:**

- Each demonstration action appears in the audit dashboard with actor, timestamp, action, and target.
- Audit filters can isolate a single patient action and a single export/print action.
- The evidence pack contains no credentials, patient health information from real persons, or unsupported product claims.

### Slice 5: Analytics Evidence Coordination

**Deliverable:** A combined California HIE evidence package with clear platform ownership.

- Agree the synthetic/cohort identifiers and measure definitions that the analytics platform will use, without requiring it to be embedded in the viewer.
- Obtain its screenshot set for configurable dashboards, publishing, drill-down, scheduled and ad hoc reports, population analysis, natural-language/AI-assisted analytics, and analytics audit records.
- Add an ownership label to every screenshot: `HiiveCare Viewer`, `Analytics Platform`, or `Smile CDR`.
- Combine the viewer and analytics evidence into one requirements-to-screenshot matrix for Smile.

**Verification criteria:**

- The analytics evidence has been supplied and approved by the analytics-platform owner.
- No viewer screenshot represents an analytics-platform capability as native HiiveCare functionality.
- The final matrix accounts for both Smile scope bullets without obscuring platform boundaries.

## Screenshot Storyboard

| Screenshot | Required visible evidence |
| --- | --- |
| 1. Patient search | Demographic fields, exact identifier/source search, recent patients, availability and source indicators |
| 2. Longitudinal summary | Aggregated record, source selector, clinical summary, safety alerts |
| 3. Clinical sections | Section navigation, filters/sort, detailed structured result, coverage/care program, SDOH |
| 4. Document view | In-app C-CDA/PDF document rendering linked to the patient |
| 5. Print/export | Selectable content and generated summary/export action |
| 6. Viewer audit | Patient activity plus document, print, and export audit records |
| 7. Analytics platform package | Separate-owner screenshots for dashboards, reporting, population analysis, AI assistance, and analytics audit |

## Acceptance Checklist

- [ ] Clinical viewer screenshots cover every item in Smile's first scope bullet.
- [ ] Analytics-platform screenshots cover configuration, publishing, drill-down, scheduled/ad hoc reporting, population analysis, and AI-assisted analytics.
- [ ] All screenshot data is synthetic and California-branded.
- [ ] The demo names Smile as the CDR partner, HiiveCare as the viewer, and identifies the separate analytics platform by its approved name.
- [ ] No screenshot or narrative claims that MX identity/access or Smile governance integration is implemented.
- [ ] Viewer audit evidence covers chart activity, document viewing, printing, and export.
- [ ] The evidence pack maps every screenshot to its corresponding Smile bullet and platform owner.

## Delivery Sequence

Execute Slice 1 first, then Slices 2 and 3. Slice 4 depends on the completed viewer interactions. Slice 5 can begin once the analytics-platform owner confirms its evidence contract, but final packaging depends on both platform evidence sets. Do not begin final screenshot capture until the acceptance checklist can be run end-to-end.