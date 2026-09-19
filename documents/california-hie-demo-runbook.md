# California HIE Clinical Viewer Demo Runbook

## Scope

HiiveCare is the clinician-facing California HIE viewer. Smile Digital Health is the CDR partner. The analytics platform owns dashboards, reporting, population analytics, AI-assisted analytics, and analytics audit evidence. Do not present this demo as a live Smile CDR, governance, or MX identity integration.

## Isolated Project Setup

Create a dedicated Medplum project named `California HIE Demo` through the authenticated Medplum admin UI. Create a separate Provider browser `ClientApplication` for this project with the local redirect URI `http://127.0.0.1:5172/` and the deployed Provider redirect URI when it is available.

Create a clinician membership for the demo. Its `AccessPolicy` must allow the following resource interactions:

| Resources | Interactions |
| --- | --- |
| `Patient`, `Organization`, `Condition`, `AllergyIntolerance`, `MedicationRequest`, `Observation`, `Encounter`, `Coverage`, `CarePlan`, `CareTeam`, `RelatedPerson`, `Procedure`, `Immunization`, `DiagnosticReport`, `DocumentReference`, `Binary`, `Provenance` | `read`, `search`, `history`, `vread` |
| `AuditEvent` | `create`, `read`, `search`, `history`, `vread` |

The provider app records the viewer actions `record-view`, `source-filter`, `document-view`, `print`, and `export` as tagged FHIR `AuditEvent` resources. The project policy must permit the `AuditEvent` interactions above or the audit dashboard will have no project-side evidence.

## Seed And Readiness

Run these commands from the `medplum-ubix` repository after acquiring an authorized California-project access token through the local secure operator flow:

```sh
node scripts/validate-california-hie-demo.mjs
MEDPLUM_ACCESS_TOKEN=... node scripts/seed-california-hie-demo.mjs
MEDPLUM_ACCESS_TOKEN=... node scripts/validate-california-hie-demo.mjs --remote
```

The seed is deterministic and uses `upsertResource`. It can be rerun without creating duplicate resources. The remote readiness check verifies that every deterministic fixture resource can be read in the target project.

## Provider Walkthrough

Use the Provider routes below after signing in to the California project:

| Route | Demonstration state |
| --- | --- |
| `/California/Patients` | Demographic search, exact source-scoped identifier search, availability badges, recent patients |
| `/Patient/:patientId/california-viewer` | Aggregated or source-specific longitudinal record, safety alerts, coverage/care program, SDOH, print and export actions |
| `/Patient/:patientId/DocumentReference/:documentId` | In-app C-CDA or PDF document preview |
| `/Patient/:patientId/export` | Existing selectable Medplum patient export workflow |
| `/California/Audit` | Viewer audit filters and filtered CSV download |

## Presenter Script

1. Sign in at the California Provider link and confirm the user menu says `California HIE Demo`.
2. Open **California HIE**, search for `Maya`, and open Maya Chen. Point out the three source availability badges: Bay Care Network, Central Valley Community Health, and Sierra Wellness Medical Group.
3. In **California Viewer**, start with **All contributing sources**. Show the longitudinal record: diabetes, metformin, A1c, three encounters, discharge document, immunization, procedure, care team, and contact.
4. Select **Bay Care Network**. Confirm the detail list changes to that source's problem, encounter, and retinal procedure. State that this is a HiiveCare clinical viewer over synthetic demonstration records, not a live Smile CDR connection.
5. Return to **All contributing sources**. Open the discharge document to show the in-portal document experience, then use the print and export entry points.
6. Search for `Elena Ramirez` and open the viewer to show the high-criticality penicillin allergy and critical potassium result.
7. Open **California Audit** to show the viewer's project-side audit evidence. State that operational analytics, reporting, population analytics, and AI analytics remain the responsibility of the separate analytics platform.

## Evidence Matrix

| Screenshot | Owner | Required visible state |
| --- | --- | --- |
| Patient search | HiiveCare Viewer | Demographic criteria, source-scoped identifier search, source availability, recently viewed record |
| Longitudinal summary | HiiveCare Viewer | Aggregated/source selection, alerts, conditions, medication, results, encounters |
| Clinical sections | HiiveCare Viewer | Coverage, care plan, SDOH, source-specific detail state |
| Document view | HiiveCare Viewer | C-CDA/XML or PDF preview inside the portal |
| Print/export | HiiveCare Viewer | Active source selection, print command, selectable export workflow |
| Audit | HiiveCare Viewer | Actor, patient/resource, action, date, and source filters plus CSV export |
| Analytics package | Analytics Platform | Dashboards, drill-down, reporting, population analysis, AI assistance, and analytics audit evidence |

Capture only synthetic records. Store screenshot files under `documents/california-hie-event-prep-screenshots/` and add their final names to this runbook after the remote readiness check passes.