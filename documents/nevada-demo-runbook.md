# Nevada HIE Demo Local Testing Runbook

**Purpose**: Step-by-step instructions to start the Nevada HIE demo, seed data, configure access policies, and verify every demo act end-to-end.

**Prerequisites**:
- Node 22+ and `npm` installed
- `medplum-ubix`, `medplum-provider`, and `medplum-patient` cloned on branch `feature/nevadahie`
- Access to the Hiive build backend: `https://api.ehr.hiivehealth.net/`
- A privileged access token or ClientApplication credentials for the target project

**Target project**: `7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8`

---

## 1. Start the Front-End Apps

`medplum-ubix` and `medplum-provider` both talk to the shared Hiive build backend. Start them on different ports.

### 1.1 medplum-ubix (admin/app)

```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix/packages/app
npm run dev
```

Expected output: app runs on `http://localhost:3000/`. Because port `3000` may be occupied on your machine, Vite may auto-increment. The demo plan assumes `http://localhost:3001/`; if Vite reports a different port, use that port.

### 1.2 medplum-provider

```bash
cd /Users/paulwinterling/github/Demos/medplum-provider
npm run dev
```

Expected output: app runs on `http://127.0.0.1:5172/`.

### 1.3 (Optional) medplum-patient

```bash
cd /Users/paulwinterling/github/Demos/medplum-patient
npm run dev
```

Expected output: app runs on `http://127.0.0.1:5173/`.

---

## 2. Authenticate and Seed Demo Data

The demo requires:
- Provider and payer users with `ProjectMembership`
- An `AccessPolicy` for provider full access
- An `AccessPolicy` for payer roster-limited access
- An `AccessPolicy` for admin access
- A payer `Group` (roster) with `Patient` members
- Patients in three consent states: opt-in, opt-out, not-declared
- A Medicaid-identifier patient for the override example
- Sample encounters so the roster dashboard is populated

### 2.1 Get an access token

Option A — privileged access token (simplest for one-off seeding):

```bash
export MEDPLUM_BASE_URL="https://api.ehr.hiivehealth.net/"
export MEDPLUM_PROJECT_ID="7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8"
export MEDPLUM_ACCESS_TOKEN="<your-privileged-token>"
```

Option B — ClientApplication credentials:

```bash
export MEDPLUM_BASE_URL="https://api.ehr.hiivehealth.net/"
export MEDPLUM_PROJECT_ID="7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8"
export MEDPLUM_CLIENT_ID="<client-id>"
export MEDPLUM_CLIENT_SECRET="<client-secret>"
```

### 2.2 Run the seed script

## Personas

| Persona | Portal | Username | Notes |
|---|---|---|---|
| Dr. Alex | medplum-provider | `nevada.provider.alex@example.com` | Full provider access |
| Sarah | medplum-provider | `nevada.payer.sarah@example.com` | Limited to Silver State roster |
| Admin | medplum-ubix | project admin account | User provisioning, audit, C-CDA import |
| Jordan Riley | (patient) | seeded patient | Opt-in patient |
| Taylor Smith | (patient) | seeded patient | Not-declared patient |
| Medicaid Member | (patient) | seeded patient | Opt-out, Medicaid override |

Use the passwords printed by `seed-nevada-hie-demo.mjs` for the provider and payer logins.

---

## 2. Authenticate and Seed Demo Data

The demo requires:
- Provider and payer users with `ProjectMembership`
- An `AccessPolicy` for provider full access
- An `AccessPolicy` for payer roster-limited access
- An `AccessPolicy` for admin access
- A payer `Group` (roster) with `Patient` members
- Patients in three consent states: opt-in, opt-out, not-declared
- A Medicaid-identifier patient for the override example
- Sample encounters so the roster dashboard is populated

A seed script already exists at `medplum-ubix/scripts/seed-nevada-hie-demo.mjs`:

```bash
cd /Users/paulwinterling/github/Demos/medplum-ubix
node scripts/seed-nevada-hie-demo.mjs
```

The script is idempotent: it upserts organizations, AccessPolicies, patients, Consent resources, payer roster Groups, encounters, and demo users.

Requires both a resource ClientApplication and admin credentials:

```bash
export MEDPLUM_CLIENT_ID="69a636e6-b110-4de7-ac73-4c2b642b48a2"
export MEDPLUM_CLIENT_SECRET="..."
export MEDPLUM_EMAIL="admin@example.com"
export MEDPLUM_PASSWORD="..."
node scripts/seed-nevada-hie-demo.mjs
```

To preview changes without writing data:

```bash
node scripts/seed-nevada-hie-demo.mjs --dry-run
```

### 2.3 Capture the generated credentials

The seed script prints generated passwords at the end:

```
nevada.provider.alex@example.com / Nevada-xxxxxxxx-Demo!
nevada.provider.jordan@example.com / Nevada-xxxxxxxx-Demo!
nevada.payer.sarah@example.com / Nevada-xxxxxxxx-Demo!
nevada.payer.miguel@example.com / Nevada-xxxxxxxx-Demo!
```

Use these credentials when logging in to `medplum-provider` and `medplum-ubix`.

**Note**: The runbook and demo script currently reference `ubix.provider.alex@example.com`, `ubix.payer.sarah@example.com`, and `ubix.admin.jordan@example.com`. The existing seed script creates `nevada.*` users instead. You can either:

1. Update the demo script to use the `nevada.*` emails and passwords, or
2. Extend the seed script (or create a wrapper) to create `ubix.*` users matching the demo script.

For consistency, it is recommended to update the demo script and runbook to use the `nevada.*` users created by the seed script.

---

## 3. Verify Environment Before Demo

### 3.1 Confirm apps compile

```bash
cd /Users/paulwinterling/github/Demos/medplum-provider
npx tsc --noEmit

# Optional: run unit tests for the slices
npx vitest run src/pages/audit src/utils/auditReport.test.ts src/pages/roster

cd /Users/paulwinterling/github/Demos/medplum-ubix/packages/app
npx tsc --noEmit
npx jest src/admin/BulkInvitePage.test.tsx src/pages/nevada/CcdaImportPage.test.tsx
```

### 3.2 Confirm seeded resources via FHIR search

With `MEDPLUM_ACCESS_TOKEN` set:

```bash
curl -s "$MEDPLUM_BASE_URL/fhir/R4/AccessPolicy" \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN" \
  -H "X-Medplum-Project: $MEDPLUM_PROJECT_ID" | jq '.entry | length'
# Expected: at least 3 (provider, payer-roster, admin)

curl -s "$MEDPLUM_BASE_URL/fhir/R4/Patient?address-state=NV" \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN" \
  -H "X-Medplum-Project: $MEDPLUM_PROJECT_ID" | jq '.total'
# Expected: 100

curl -s "$MEDPLUM_BASE_URL/fhir/R4/Group?identifier=nevada-payer-roster" \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN" \
  -H "X-Medplum-Project: $MEDPLUM_PROJECT_ID" | jq '.entry[0].resource.member | length'
# Expected: roster member count, e.g. 20
```

---

## 4. Act-by-Act Verification

Open the apps in separate browser windows so you can switch personas quickly.

### Act 1: Provider Login & Patient Search

1. In **medplum-provider** (`http://127.0.0.1:5172/`), sign in as `nevada.provider.alex@example.com` using the password printed by the seed script.
2. Click **Patients** in the left menu.
3. Search for `Jordan Riley`.
4. Confirm:
   - Patient opens without warnings.
   - Header shows Nevada MRN and source organization.
   - Green opt-in banner is visible.

**Troubleshooting**:
- If the search returns zero results, verify the provider AccessPolicy allows `Patient` `search` and `read`.
- If the banner is missing, check that a `Consent` resource exists for Jordan Riley with `status = active` and category opt-in.

### Act 2: Consent Enforcement

#### 2a Opt-in patient

Open Jordan Riley. Confirm full chart loads and timeline/encounters are visible.

#### 2b Break-the-glass

1. Search for `Taylor Smith`.
2. Open the patient.
3. Confirm yellow **not declared** banner and that the timeline is hidden/disabled.
4. Click **Break the glass**, enter a reason, and submit.
5. Confirm chart loads.
6. In **medplum-ubix** (`/AuditEvent?entity=Patient/<taylor-smith-id>`), confirm an `AuditEvent` with action `E` (break-glass access) exists.

**Troubleshooting**:
- If break-the-glass is not offered, verify the patient has a `Consent` with `status = draft` or no Consent, and that the provider AccessPolicy includes a break-glass exception.
- If no `AuditEvent` appears, confirm the admin token can read `AuditEvent` resources.

#### 2c Medicaid override

1. Search for the seeded Medicaid patient (e.g., `Medicaid Member`).
2. Open the patient.
3. Confirm red opt-out banner and a second banner: **"Access permitted by Medicaid override policy."**
4. Confirm chart loads despite opt-out.

**Troubleshooting**:
- If access is denied, verify the patient has an `identifier` with system `https://hiivecare.example/fhir/Identifier/medicaid-member` and that the provider AccessPolicy includes the Medicaid override rule.

#### 2d Update consent

1. Open Taylor Smith.
2. Click **Update consent**.
3. Change status to opt-in.
4. Save.
5. In **medplum-ubix**, open `/Consent`, `/Provenance`, and `/AuditEvent` to confirm audit trail.

### Act 3: Roster-Based Access

1. Log out of medplum-provider, then sign in as `nevada.payer.sarah@example.com` using the password printed by the seed script.
2. Confirm landing page is the **Roster** dashboard.
3. Confirm encounters are limited to the roster Group.
4. Filter by visit type and sort by patient name / encounter date.
5. In the **Patients** search, look for a patient **not** in the roster Group (e.g., `Medicaid Member`).
6. Confirm no results.

**Troubleshooting**:
- If Sarah sees all patients, check her `ProjectMembership.accessPolicy` points to the payer roster policy and that the policy references the correct `Group` ID.
- If the roster dashboard is empty, verify the roster `Group` has `member.entity` references and that those patients have recent `Encounter` resources.

### Act 4: C-CDA Import

1. In **medplum-ubix**, sign in with a project admin account for the target project.
2. Navigate to **Project admin → Nevada C-CDA** (`/admin/nevada/ccda-import`).
3. Upload `packages/examples/src/nevada-ccda/sample-ccda.xml`.
4. Submit.
5. Confirm:
   - A success message appears.
   - New or merged `Patient`, `Encounter`, `Observation`, `Condition`, `DocumentReference` resources exist.
6. In **medplum-provider**, search for the imported patient (`Jordan Riley` or the patient specified during import).
7. Open **Timeline** and confirm the imported document and resources are listed.

**Troubleshooting**:
- If import fails with a 400, check the XML is well-formed and that the admin token has write access.
- If resources do not appear in the timeline, verify `DocumentReference.status` is `current` and `DocumentReference.subject` points to the correct patient.

### Act 5: C-CDA Export

1. In **medplum-provider**, open any patient chart.
2. Click **Timeline**.
3. Click **Export C-CDA**.
4. Confirm an XML file downloads.
5. Open the XML and confirm it contains `ClinicalDocument` and at least one section.

**Troubleshooting**:
- If the export button is missing, verify the patient ID is passed to `CcdaExportCard` in `TimelineTab.tsx`.
- If the export fails, check the server supports the `$ccda-export` operation and that the provider token has `Patient` read access.

### Act 6: Audit Dashboard

1. In **medplum-provider**, sign in with a project admin account for the target project.
2. Click **Audit** in the left menu.
3. Confirm metrics cards load (Total events, Unique users, etc.).
4. Filter by user `Dr. Alex`, action `search`, and today’s date.
5. Confirm events appear.
6. Click **Export CSV** and confirm a CSV downloads.

**Troubleshooting**:
- If the Audit menu is missing, verify `membership.admin === true`.
- If no events appear, ensure `AuditEvent` resources exist and the admin AccessPolicy allows `AuditEvent` `search`/`read`.

### Act 7: User Provisioning

1. In **medplum-ubix**, navigate to **Project admin → Users** (`/admin/users`).
2. Confirm the user list loads.
3. Click a user to open **ProjectMembership details**.
4. Click **Bulk Invite**.
5. Upload a CSV:
   ```csv
   firstName,lastName,email,role,admin,sendEmail
   George,Washington,george+nevada-test@example.com,Practitioner,false,true
   ```
6. Confirm validation succeeds.
7. Click **Invite 1 user**.
8. Confirm the new user appears in the user list.

**Troubleshooting**:
- If bulk invite fails with "project not found", verify the admin is logged into the correct project.
- If email send fails, this is expected in environments without SES configured; the `ProjectMembership` is still created.

---

## 5. Reset Demo State

The existing seed script does not have a `--reset` flag. To reset, run the script with `--dry-run` first to review what exists, then delete demo resources by identifier using a small cleanup script or the Medplum admin UI filtered by the identifier system `https://hiivehealth.com/fhir/identifier/nevada-demo`.

To clean all Nevada demo resources:

```bash
# 1. Find resources tagged with the demo identifier system
curl -s "$MEDPLUM_BASE_URL/fhir/R4/Patient?identifier=https://hiivehealth.com/fhir/identifier/nevada-demo|&_count=200" \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN" \
  -H "X-Medplum-Project: $MEDPLUM_PROJECT_ID"

# 2. Delete each resource by ID, then repeat for Encounter, Consent, Group, Organization, ProjectMembership.
```

A future improvement is to add `--reset` to `seed-nevada-hie-demo.mjs`.

---

## 6. Known Limitations & Out-of-Scope Items

The following items are intentionally not built for the demo and are documented as future/production capabilities:

| Capability | Demo status | Notes |
|---|---|---|
| Smile Digital Health CDR integration | Out of scope | Demo uses Medplum native FHIR store |
| Okta / SAML SSO / MFA | Out of scope | Native Medplum login used |
| Verato MPI | Out of scope | Built-in `Patient/$match` is the fallback |
| DOD/VA and immunization registry queries | Out of scope | Mocked if shown |
| HL7 v2 ingest | Out of scope | C-CDA only |
| 90-day inactivity lockout | Out of scope | Requires scheduled Bot or IdP |

---

## 7. Quick-Reference Commands

```bash
# Start apps
cd medplum-ubix/packages/app && npm run dev
cd medplum-provider && npm run dev
cd medplum-patient && npm run dev

# Seed / dry-run demo
cd medplum-ubix
node scripts/seed-nevada-hie-demo.mjs --dry-run
node scripts/seed-nevada-hie-demo.mjs

# Provider tests
cd medplum-provider
npx vitest run src/pages/audit src/utils/auditReport.test.ts src/pages/roster

# Admin app tests
cd medplum-ubix/packages/app
npx jest src/admin/BulkInvitePage.test.tsx src/pages/nevada/CcdaImportPage.test.tsx
```

---

## 8. Expected Demo State Summary

After seeding, the project should contain:

- **3 AccessPolicies**: provider-access, payer-roster-access, admin-access
- **4 users**: Alex Martinez (provider), Jordan Chen (provider), Sarah Williams (payer), Miguel Rodriguez (payer)
- **100 Nevada patients**
- No dedicated admin user is created by the seed script; use a project admin login for admin features
- **1 payer roster Group** with ~20 members
- **3 Consent states** represented: opt-in, opt-out, not-declared
- **1 Medicaid patient** with override identifier
- **Sample encounters** for roster dashboard population

If any of these counts are incorrect, re-run the seed script or inspect the seed-script output for failures.
