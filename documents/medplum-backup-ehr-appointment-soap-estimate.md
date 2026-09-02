# Medplum Backup EHR - Appointment UI + SOAP Documentation Estimate

## Purpose

This document estimates a Medplum project where:

- appointment and patient history data is pulled from another EHR via an already-built FHIR API service
- providers use Medplum as a backup EHR view/documentation layer
- providers can review schedules, open patient charts, and complete a basic SOAP note
- Medplum does not place external orders (pharmacy, labs, imaging)
- patient data is automatically deleted 7 days after the scheduled visit

## Native Medplum Constraint

This estimate uses Medplum-native capabilities for the application and workflow layer. It does not add a custom backend, custom database, separate workflow engine, document-rendering service, or external ordering integration.

The existing upstream FHIR API service remains an external dependency that is already complete. This project consumes the FHIR data it provides; rebuilding that service is not included in the estimate.

Native Medplum capabilities used by this estimate:

- FHIR R4 resources stored in Medplum
- Medplum REST/FHIR APIs and SDK client
- `@medplum/react` components and a Medplum-based React application for the schedule, chart, and SOAP screens
- `AccessPolicy`, `ProjectMembership`, and `PractitionerRole` for provider restrictions
- `Questionnaire` / `QuestionnaireResponse` and `Composition` for SOAP documentation
- Medplum Bot automation and Medplum scheduling/subscription mechanisms for retention cleanup
- `AuditEvent` and standard Medplum audit capabilities for deletion and access records

Native-only does not mean zero application code. The schedule, chart, and SOAP screens still require configuration and custom React page composition using Medplum's native APIs and component library.

## Confirmed Scope

### In Scope

- Provider schedule view (calendar and/or dashboard list)
- Appointment details and patient drill-in
- Read-only historical patient chart data sent by the API service
- Basic SOAP note documentation for the visit
- Limited provider permissions (no order entry to external systems)
- Automated data deletion 7 days after scheduled visit

### Out Of Scope

- Pharmacy, lab, imaging, or referral system integrations
- E-prescribing and downstream order fulfillment
- Full enterprise EHR functionality
- Long-term records retention in Medplum

## Functional Requirements

1. Provider can view only their own schedule.
2. Provider can open an appointment and view patient demographics plus historical chart data.
3. Provider can document Subjective, Objective, Assessment, and Plan.
4. Plan may contain free-text recommendations for meds/labs, but no orders are executed.
5. Provider access policy prevents ordering workflows and other unnecessary capabilities.
6. A retention process deletes patient and related visit data 7 days after appointment date.

## Architecture Outline

### Data Ingestion

- External API service writes appointment and patient-history payloads into Medplum FHIR resources.
- Medplum acts as the temporary clinical workspace.
- No new ingestion service or custom integration middleware is included.

### Core FHIR Resources

- `Appointment` for schedule events
- `Patient` for demographics
- `Practitioner` and `PractitionerRole` for provider identity and assignment
- `Encounter` for visit context
- `Observation`, `Condition`, `AllergyIntolerance`, `MedicationStatement`, `Procedure` for imported history
- `Questionnaire` and `QuestionnaireResponse` or `Composition` for SOAP note capture
- `Task` for optional cleanup tracking and operational status

### UI Surface

- Medplum React application schedule page: calendar + list toggle
- Medplum React application appointment detail panel with patient context
- Medplum React application patient chart summary page (read-only)
- Medplum React application SOAP note form page

### Security And Access

- Provider policy allows read on schedule and patient history resources needed for visits.
- Provider policy allows write only to encounter documentation artifacts.
- Provider policy denies order placement resources and write paths for medication/lab requests.

## Data Retention And Auto-Delete Strategy

Recommended implementation:

1. On appointment create/update, compute `purge_at = appointment.start + 7 days` and store it in a FHIR extension or a native Medplum tracking resource.
2. Run a scheduled Medplum cleanup Bot using Medplum's native automation/scheduling mechanism.
3. Query records with `purge_at <= now` through the Medplum FHIR API.
4. Delete encounter documentation and linked patient data loaded for the backup workflow.
5. Record an audit trail of deletions using `AuditEvent` and native Medplum audit capabilities.

Deletion order should be deterministic to avoid referential failures:

1. Visit artifacts (`QuestionnaireResponse`, notes, documents)
2. Encounter and related visit resources
3. Patient-level temporary resources
4. Patient resource (if no remaining dependency)

Important operational note:

- Confirm compliance and legal retention requirements before hard-delete in production.
- If required, use soft-delete/archive pattern externally while still clearing active Medplum workspace data.

## Implementation Slices

### Slice 1: Foundation And Access Policy

- Configure Medplum project, roles, and constrained provider `AccessPolicy`.
- Validate that prohibited order paths are blocked.

### Slice 2: Schedule UI

- Compose a Medplum React provider schedule view from `Appointment` resources.
- Add calendar and list modes with filtering.

### Slice 3: Patient Chart Read Layer

- Compose read-only patient chart panels from imported FHIR history using Medplum APIs/components.
- Optimize chart loading for common provider workflows.

### Slice 4: SOAP Note Workflow

- Configure a Medplum `Questionnaire` and compose the SOAP capture form with Medplum React components.
- Persist note to encounter-linked resources.

### Slice 5: Retention Automation

- Implement purge timestamp handling.
- Implement scheduled Medplum cleanup Bot with deletion audit log.

### Slice 6: QA, Hardening, And Pilot Readiness

- End-to-end workflow tests.
- Access-policy validation tests.
- Retention/deletion reliability tests.

## Custom Development Included Within The Native Medplum Approach

The following are application-level configuration or React composition work, not separate non-Medplum services:

- Schedule calendar/list page composition
- Appointment-to-patient navigation
- Read-only chart summary layout
- Basic SOAP form layout and encounter linkage
- Provider-specific navigation and page guards
- Retention Bot logic and deletion-scope rules
- Access-policy test fixtures and workflow tests

The following are explicitly excluded:

- Custom backend API
- Custom database
- Separate queue or workflow engine
- Separate scheduler
- External order broker
- Pharmacy, lab, imaging, or e-prescribing integration
- External PDF/document rendering service

## Timeline Estimate (API Integration Already Done)

### 2-Developer Team

- Best credible range: 8-12 weeks
- Conservative range: 10-16 weeks

### 4-Developer Team

- Best credible range: 6-10 weeks
- Conservative range: 8-14 weeks

Why this is not half with 4 developers:

- encounter and SOAP data contract still needs centralized design
- retention/deletion workflow must be coordinated with chart and appointment model
- security-policy and QA gates remain serial at key points

## Slice-Level Elapsed Estimates

| Slice | Scope | 2 Dev Low | 2 Dev High | 4 Dev Low | 4 Dev High |
|---|---|---|---|---|---|
| 1 | Foundation and access policy | 1 week | 2 weeks | 1 week | 1.5 weeks |
| 2 | Schedule UI | 2 weeks | 3 weeks | 1.5 weeks | 2.5 weeks |
| 3 | Read-only patient chart | 1.5 weeks | 3 weeks | 1 week | 2.5 weeks |
| 4 | SOAP note workflow | 1.5 weeks | 2.5 weeks | 1 week | 2 weeks |
| 5 | Retention automation | 1 week | 2.5 weeks | 1 week | 2 weeks |
| 6 | QA and hardening | 2 weeks | 3 weeks | 1.5 weeks | 3 weeks |

## Internal Team Costing Summary (Phase 1)

Use this table with your hourly rates.

| Function | 2 Dev Low Hours | 2 Dev High Hours | 4 Dev Low Hours | 4 Dev High Hours |
|---|---|---|---|---|
| Design | 80 | 120 | 100 | 140 |
| Development | 640 | 1120 | 800 | 1600 |
| Testing | 160 | 280 | 180 | 320 |
| PM / Delivery Coordination | 60 | 120 | 80 | 160 |

Cost formula:

- Total Cost = `(Design Hours x Design Hourly Rate) + (Development Hours x Development Hourly Rate) + (Testing Hours x Testing Hourly Rate) + (PM Hours x PM Hourly Rate)`

## Key Risks

1. Retention logic deletes too broadly or too narrowly.
2. Incomplete API payload mapping causes chart gaps.
3. Overly restrictive access policy breaks provider workflow.
4. Under-restrictive policy exposes ordering capabilities unintentionally.

## Mitigations

1. Add dry-run mode and reconciliation reporting for cleanup jobs.
2. Create explicit resource mapping contract with test fixtures from the source API.
3. Add access-policy integration tests for both allowed and denied actions.
4. Roll out in pilot with audit monitoring before broader deployment.

## Open Questions

1. Do you want only future appointments, or also recent historical appointments, in the schedule UI?
2. Should deletion be strict hard-delete or soft-delete plus external archive reference?
3. What minimum chart sections are required for the provider view on day one?
4. Should SOAP notes be stored as `QuestionnaireResponse`, `Composition`, or both?
5. Do you need downtime-mode behavior if source API sync is delayed?