# Nevada HIE Demo Script

**Date**: 2026-07-23
**Portal**: Hiive/Medplum Provider Portal (Medplum native CDR stand-in for Smile Digital Health)
**Audience**: Nevada HIE leadership, clinical operations, technical evaluators
**Total runtime**: ~30 minutes

---

## Setup & Roles

| Persona | Portal | Username | Notes |
|---|---|---|---|
| Dr. Alex | medplum-provider | `nevada.provider.alex@example.com` | Full provider access |
| Sarah | medplum-provider | `nevada.payer.sarah@example.com` | Limited to Silver State roster |
| Admin | medplum-ubix | project admin account | User provisioning, audit, C-CDA import |
| Jordan Riley | (patient) | seeded patient | Opt-in patient |
| Taylor Smith | (patient) | seeded patient | Not-declared patient |
| Medicaid Member | (patient) | seeded patient | Opt-out, Medicaid override |

---

## Act 1: Provider Login & Patient Search (5 min)

**Narrative**: Providers sign in with native Medplum credentials. In production this would be Okta/SAML SSO with MFA; today we show native login and note the integration path.

1. Open **medplum-provider** at `http://127.0.0.1:5172/`.
2. Log in as **Dr. Alex** (`nevada.provider.alex@example.com`).
3. From the landing page, click **Patients** in the left menu.
4. Search for `Jordan Riley` by name/DOB or MRN.
5. Point out the patient header:
   - All associated MRNs and source organizations.
   - Green **opt-in** consent banner.
6. Open the patient chart.
   - Timeline, encounters, conditions, medications load normally.

**Talking points**:
- Medplum supports OIDC/SAML IdP for SSO/MFA; native login is used for the demo only.
- `Patient.identifier` and `Patient.link` carry associated MRNs and source orgs.
- Consent is evaluated at the AccessPolicy layer before any data is returned.

---

## Act 2: Consent Enforcement (7 min)

### 2a Opt-in patient

1. With Dr. Alex, open **Jordan Riley**.
2. Confirm the green opt-in banner and full chart access.

### 2b Break-the-glass (not declared)

1. Search for **Taylor Smith**.
2. Open the patient record.
3. Show the yellow **not declared** banner and disabled chart.
4. Click **Break the glass**.
5. Enter a reason (e.g., "Emergency access — unresponsive patient").
6. Chart loads.
7. In **medplum-ubix**, open **AuditEvent** search and filter by `Taylor Smith` to show the break-glass `AuditEvent`.

### 2c Medicaid override (opt-out)

1. Search for the **Medicaid Member** patient.
2. Open the record.
3. Show the red **opt-out** banner, but chart still loads because `Patient.identifier` matches the Medicaid payer system.
4. Banner reads: "Access permitted by Medicaid override policy."

### 2d Update consent

1. Still as Dr. Alex, open **Taylor Smith**.
2. Click **Update consent**.
3. Change status from **not declared** to **opt-in**.
4. Save.
5. Show the resulting `Consent`, `Provenance`, and `AuditEvent` resources in medplum-ubix.

**Talking points**:
- AccessPolicy rules combine `Consent.status`, break-glass reason capture, and Medicaid identifier override.
- Every break-glass and consent change is auditable via `AuditEvent`/`Provenance`.

---

## Act 3: Roster-Based Access (5 min)

1. Log out, then log in as **Sarah** (`nevada.payer.sarah@example.com`).
2. Sarah lands on the **Roster** dashboard showing last-30-day encounters for her roster Group only.
3. Filter by visit type (Ambulatory, Emergency, Inpatient, Home health).
4. Sort by patient name and encounter date.
5. Try to search for a patient **not** on the roster.
   - Result: no results / access denied.
6. Switch to the **Patients** view; search is still scoped to the roster Group.

**Talking points**:
- Payer roster access is enforced by an AccessPolicy parameterized against `%roster_group`.
- `Group.member` references drive the patient compartment; no custom authorization code is required.

---

## Act 4: CDR Ingest & Document View (6 min)

1. Switch to **medplum-ubix** and log in with a project admin account.
2. Navigate to **Project admin → Nevada C-CDA**.
3. Click **Import C-CDA** and upload `packages/examples/src/nevada-ccda/sample-ccda.xml`.
4. Optionally specify a target patient; otherwise a new patient is created.
5. Submit and show the resulting resources:
   - `Patient`, `Encounter`, `Observation`, `Condition`, `MedicationRequest`, `DocumentReference`.
6. Open the newly created/merged patient in **medplum-provider**.
7. Click **Timeline**; point to the imported document and derived resources.

**Talking points**:
- `@medplum/ccda` converts CDA ↔ FHIR natively.
- In production the portal would read CDA documents from Smile via FHIR DocumentReference/$docref; today we ingest a sample directly to demonstrate conversion.
- HL7 v2 ingest and Smile connectivity are noted as out of scope.

---

## Act 5: CDA Export (3 min)

1. In **medplum-provider**, open any patient chart.
2. Click **Timeline**.
3. Click **Export C-CDA**.
4. Medplum calls `$ccda-export` and downloads a CDA XML file.
5. Open the file briefly to show the Continuity of Care Document sections.

**Talking points**:
- `$ccda-export` is a native Medplum operation.
- The exported document can be shared with external HIEs, payers, or patients.

---

## Act 6: Audit & Reporting (4 min)

1. In **medplum-provider**, log in with a project admin account.
2. Click **Audit** in the left menu.
3. Show the audit dashboard:
   - Summary metrics (total events, unique users, searches, document exports, consent updates).
   - Filters: user, entity (patient/resource), action, date range.
4. Filter by **Dr. Alex** and the current date.
5. Show searches, document exports, and consent updates.
6. Click **Export CSV** to download a report.
7. Open the CSV to show the audit trail.

**Talking points**:
- Medplum generates `AuditEvent` automatically on reads, searches, and writes.
- No external SIEM/BI is required for routine usage reporting; data is accessible via FHIR search.

---

## Act 7: User Provisioning (Admin) (3 min)

1. In **medplum-ubix**, navigate to **Project admin → Users**.
2. Show the user list with filters by profile type (Practitioner, Patient, RelatedPerson).
3. Click a user to open **ProjectMembership details** and the linked profile.
4. Click **Bulk Invite** and upload a CSV such as:
   ```csv
   firstName,lastName,email,role,admin,sendEmail
   George,Washington,george+nevada-test@example.com,Practitioner,false,true
   Sarah,Connor,sarah+nevada-test@example.com,Practitioner,false,true
   ```
5. Show the preview, then click **Invite users**.
6. New memberships appear in the user list.

**Talking points**:
- Medplum natively stores `Practitioner` NPI/license, `Organization` identifiers, and `ProjectMembership` roles.
- Bulk invite is useful for onboarding payer and provider cohorts.

---

## Closing (2 min)

**Summary statement**:

> Medplum's native provider portal, AccessPolicy engine, FHIR Consent, roster Groups, `AuditEvent` reporting, and `@medplum/ccda` conversion satisfy Nevada HIE's portal requirements using configuration and built-in features rather than custom code. Production integration points — Smile Digital Health CDR read, Okta SSO/MFA, Verato MPI, and HL7 v2 ingest — are clearly scoped and can be layered on without rewriting the portal logic.

**Q&A**:
- Be ready to show AccessPolicy JSON and Consent resources.
- Be ready to demonstrate `Patient/$match` as the MPI fallback.

---

## Appendix: Demo URLs

| Component | URL | Start command |
|---|---|---|
| Medplum app (admin) | `http://localhost:3001/` | `cd medplum-ubix/packages/app && npm run dev -- --port 3001` |
| Provider portal | `http://127.0.0.1:5172/` | `cd medplum-provider && npm run dev -- --host 127.0.0.1` |
| Patient portal | `http://127.0.0.1:5173/` | `cd medplum-patient && npm run dev` |
| Backend | `https://api.ehr.hiivehealth.net/` | — |
| Target project | `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8` | — |

## Appendix: Sample Bulk-Invite CSV

```csv
firstName,lastName,email,role,admin,sendEmail,accessPolicyId
George,Washington,george@example.com,Practitioner,false,true,
Sarah,Connor,sarah@example.com,Practitioner,false,true,
```

Optional columns: `admin`, `sendEmail`, `accessPolicyId`. If `accessPolicyId` is omitted, the default access policy selected in the UI is used.
