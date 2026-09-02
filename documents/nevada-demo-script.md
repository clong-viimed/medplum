# Nevada HIE Demo Script

**Date**: 2026-07-23
**Portal**: Hiive/Medplum Provider Portal (Medplum native CDR stand-in for Smile Digital Health)
**Audience**: Nevada HIE leadership, clinical operations, technical evaluators
**Total runtime**: ~30 minutes

---

## 30-Second Intro

> "What you're about to see is a working prototype of the HiiveCare portal — built by Hiive Health for HealthHIE Nevada.
>
> HiiveCare is a clinical portal layer that sits on top of any FHIR-native clinical data repository — whether that's Smile Digital Health, AWS Health Lake, or another CDR of Nevada's choosing. The CDR handles data ingestion and storage. HiiveCare handles everything the people need to do with that data: access it, act on it, and stay accountable for it.
>
> In the next 30 minutes, we'll walk through five capabilities: provider access and consent enforcement, roster-based payer access, clinical data and document export, and audit reporting.
>
> Let's get started."

---

## Setup & Roles

| Persona | Portal | Username | Password | Notes |
|---|---|---|---|---|
| Dr. Alex | medplum-provider | `nevada.provider.alex@example.com` | `Nevada-5637c857-Demo!` | Full provider access |
| Dr. Jordan | medplum-provider | `nevada.provider.jordan@example.com` | `Nevada-51659e51-Demo!` | Full provider access |
| Sarah | medplum-provider | `nevada.payer.sarah@example.com` | `Nevada-410d4b60-Demo!` | Limited to Silver State roster |
| Miguel | medplum-provider | `nevada.payer.miguel@example.com` | `Nevada-36a6ee96-Demo!` | Limited to High Desert roster |
| Admin | medplum-ubix | `admin@example.com` | `medplum_admin` | User provisioning |
| Nevada Admin | medplum-provider | `nevada.admin@example.com` | `Nevada-669a1e03-Demo!` | Audit dashboard and reporting |
| Jordan Riley | (patient) | seeded patient | — | Opt-in patient |
| Taylor Smith | (patient) | seeded patient | — | Not-declared patient |
| Casey Riverton | (patient) | seeded patient | — | Opt-out, Medicaid override |

---

## Act 1: Provider Login & Patient Search (5 min)

**Narrative**: Providers sign in with native Medplum credentials. In production this would be Okta/SAML SSO with MFA; today we show native login and note the integration path.

1. Open **medplum-provider** at `http://127.0.0.1:5172/`.
2. Log in as **Dr. Alex** (`nevada.provider.alex@example.com` / `Nevada-5637c857-Demo!`).
3. From the landing page, click **Patients** in the left menu.
4. In the patient list, filter by **Name** = `Jordan Riley` and **DOB** = `1985-03-12`.
5. Point out the patient header:
   - **Patient Identifiers** panel showing MRN, source organization, SSN, and Medicaid ID (when applicable).
   - Green **opt-in** consent banner.
6. Open the patient chart.
   - Timeline, encounters, conditions, medications load normally.

**Talking points**:
- Medplum supports OIDC/SAML IdP for SSO/MFA; native login is used for the demo only.
- `Patient.identifier` and `Patient.link` carry associated MRNs and source orgs.
- Consent is evaluated at the AccessPolicy layer before any data is returned.
- **Self-service password reset**: Users can reset forgotten passwords directly from the sign-in screen via "Forgot password" — no admin intervention required. In production, Okta handles this natively with security questions, MFA-based recovery, and configurable reset flows.
- **Account inactivity lockout**: In production, Okta enforces automatic account disable/lock after a configurable number of inactive days. Medplum honors the resulting token state — if Okta blocks login, the portal blocks access. This satisfies Nevada HIE's auto-disable requirement without custom portal code.
- **Password complexity and history**: Enterprise password rules (complexity, expiration, history, breach detection) are enforced by Okta in production. For this demo, Medplum native password controls are in place as a stand-in.

---

## Act 2: Consent Enforcement (7 min)

### 2a Opt-in patient

1. With Dr. Alex, open **Jordan Riley** (DOB `1985-03-12`).
2. Confirm the green opt-in banner and full chart access.

### 2b Break-the-glass (not declared)

1. Search for **Taylor Smith** (DOB `1992-07-24`).
2. Open the patient record.
3. Show the yellow **not declared** banner and disabled chart.
4. Click **Break the glass**.
5. Enter a reason (e.g., "Emergency access — unresponsive patient").
6. Chart loads.
7. In **medplum-ubix**, open **AuditEvent** search and filter by `Taylor Smith` to show the break-glass `AuditEvent`.

### 2c Update consent

1. Still as Dr. Alex, open **Taylor Smith** (DOB `1992-07-24`).
2. Click **Update consent**.
3. Change status from **not declared** to **opt-in**.
4. Save.
5. Show the resulting `Consent` resources in medplum-ubix.

### 2d Medicaid override (opt-out)

1. Search for **Casey Riverton** (DOB `1978-11-05`).
2. Open the record.
3. Show the red **opt-out** banner, but chart still loads because `Patient.identifier` matches the Medicaid payer system.
4. Banner reads: "Access permitted by Medicaid override policy."

**Talking points**:
- AccessPolicy rules combine `Consent.status`, break-glass reason capture, and Medicaid identifier override.
- Every break-glass and consent change is auditable via `AuditEvent`/`Provenance`.

---

## Act 3: Roster-Based Access (5 min)

1. Log out, then log in as **Sarah** (`nevada.payer.sarah@example.com` / `Nevada-410d4b60-Demo!`).
2. Sarah lands on the **Roster** dashboard showing last-30-day encounters for her roster Group only.
3. Filter by visit type (Ambulatory, Emergency, Inpatient, Home health).
4. Sort by patient name and encounter date.
5. Try to search for a patient **not on your roster**.
   - Example: as **Sarah** (Silver State Plan), search for **Taylor Smith** (DOB `1992-07-24`).
   - Taylor Smith is on the High Desert Health roster, not Silver State.
   - Result: no results / access denied.
6. Switch to the **Gaps in Care** tab.
   - Show a diabetic patient overdue for an A1C lab.
   - Show a patient with an active medication who has not refilled in 90+ days.
   - Click a patient name to open the chart.
7. Switch to the **Patients** view; search is still scoped to the roster Group.

**Talking points**:
- Payer roster access is enforced by an AccessPolicy parameterized against `%roster_group`.
- `Group.member` references drive the patient compartment; no custom authorization code is required.
- Care gaps are derived from FHIR `Condition`, `Observation`, and `MedicationRequest` resources — no separate rules engine is required.

---

## Act 4: CDR Document View (6 min)

1. In **medplum-provider**, open **Jordan Riley** (DOB `1985-03-12`) — the same opt-in patient from Act 1.
2. Open **Timeline** and show the clinical summary view:
   - `Condition` / problem list entries
   - `Observation` / lab results
   - `Encounter` history
   - `DocumentReference` / document-related records where present
3. Explain that in production this data is sourced from Smile's CDR and exchanged through FHIR resources.
4. Emphasize that the portal demo is focused on document visibility and workflow consumption, not CDA ingest in Medplum.

**Talking points**:
- For this demo scope, Medplum is not used for CDA ingest.
- In production, Smile CDR is the source system and document/clinical data is delivered to the portal via FHIR (for example, `DocumentReference` and related resources).
- HL7 v2 ingest and Smile connectivity orchestration are noted as out of scope for this demo run.

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

1. In **medplum-provider**, log in as **Nevada Admin** (`nevada.admin@example.com` / `Nevada-669a1e03-Demo!`).
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

## Act 6b: Hiive AI Insights — Analytics Module (2 min)

**Navigate to**: Hiive AI Insights (open in separate browser tab before the demo)

**Recommended dashboard sequence** (in order — do not try to show all):
1. **HIE Intelligence → Executive Dashboards → Analytics Dashboard**
2. **Nevada HIE → Roster & Population Analytics → Member worklist**
3. **Nevada HIE → Statewide Exchange Performance → Most active participants**

**Steps**:
1. Transition from the portal: *"Let me show you the analytics layer that sits alongside the portal."*
2. Open **HIE Intelligence → Executive Dashboards → Analytics Dashboard**.
   - Point to: active users (1.68K), chart views (22.31K), consent events (9K), queries (25.08K), 99% uptime.
   - Point to the **Records Viewed vs Exported** trend chart.
   - Point to the **Break Glass Events** chart — compliance trend over time.
3. Switch to **Nevada HIE → Roster & Population Analytics → Member worklist**.
   - Point to: 2.04K attributed members, 3.32K open care gaps, 440 high/critical risk patients.
   - Point to the **Care-gap opportunity** chart — shows gap types: A1C overdue, mammogram, BP not controlled, etc.
   - Point to the **Risk vs. open gaps** scatter — shows high-risk patients with the most unaddressed gaps.
4. Switch to **Statewide Exchange Performance → Most active participants**.
   - Point to: 403 provisioned users, 378 active, top participating organizations by event volume.
   - Point to the condition distribution tiles: hypertension, hyperlipidemia, Type 2 diabetes.

**Talking points**:
- Hiive AI Insights is an integrated analytics module inside HiiveCare — not a separate product.
- It provides the population-level and operational reporting layer that the portal's per-patient views cannot.
- All metrics are derived from the same FHIR event stream — no separate data pipeline or warehouse required.
- Nevada's specific usage report requirements — chart views per user, queries by org, encounter lists by roster — are all addressed in these dashboards.
- In production this connects directly to the CDR event stream; for this demo it is running against representative Nevada HIE data.

---

## Act 7: User Provisioning (Admin) (3 min)

1. Open **medplum-ubix** at `http://127.0.0.1:3001/` and log in as **Admin** (`admin@example.com` / `medplum_admin`). When prompted to choose a project, select **Hiive Health Demo**.
2. Navigate to **Admin → Project → Users**.
3. Show the user list with filters by profile type (Practitioner, Patient, RelatedPerson).
4. **Assign an Access Policy to a user**:
   - Click the row for **Dr. Alex** (`nevada.provider.alex@example.com`) — this opens **ProjectMembership Details**.
   - Click **Go to ProjectMembership** → then click **Edit**.
   - In the **Access Policy** field, search for and select the desired policy (e.g. `Nevada Provider Access Policy`).
   - Click **Save**.
   - Explain that this controls exactly which FHIR resource types and compartments the user can read/write.
5. Click **Bulk Invite** and upload a CSV such as:
   ```csv
   firstName,lastName,email,role,admin,sendEmail
   George,Washington,george+nevada-test@example.com,Practitioner,false,true
   Sarah,Connor,sarah+nevada-test@example.com,Practitioner,false,true
   ```
6. Show the preview, then click **Invite users**.
7. New memberships appear in the user list.

**Talking points**:
- Access Policy is assigned per **ProjectMembership**, not per user globally — the same user can have different permissions in different projects.
- Medplum natively stores `Practitioner` NPI/license, `Organization` identifiers, and `ProjectMembership` roles.
- Bulk invite is useful for onboarding payer and provider cohorts.

---

## Closing (2 min)

**Summary statement**:

> Medplum's native provider portal, AccessPolicy engine, FHIR Consent, roster Groups, `AuditEvent` reporting, and native C-CDA export satisfy Nevada HIE's portal requirements using configuration and built-in features rather than custom code. Production integration points — Smile Digital Health CDR read, Okta SSO/MFA, Verato MPI, and HL7 v2 ingest — are clearly scoped and can be layered on without rewriting the portal logic.

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

---

## Full Spoken Talking Script

> **How to use this**: Read each block naturally while navigating the UI. Pause after each sentence when clicking. You do not need to read every word verbatim — this is a guide, not a teleprompter.

---

### Intro (30 seconds)

"What you're about to see is a working prototype of the HiiveCare portal, built by Hiive Health for HealthHIE Nevada.

HiiveCare is a portal layer designed to sit on top of any FHIR-native clinical data repository — Smile Digital Health, AWS Health Lake, or another CDR of Nevada's choosing. The CDR owns data ingestion and storage. HiiveCare owns everything the people need to do with that data: access it, act on it, share it, and stay accountable for it.

Over the next 30 minutes, we'll walk through five capabilities: provider access and consent enforcement, roster-based payer access, clinical data and document export, and audit reporting. Let's get into it."

---

### Act 1 — Provider Login and Patient Search

*[Navigate to http://127.0.0.1:5172/ and log in as Dr. Alex]*

"We'll start by logging in as Dr. Alex Martinez — a provider at Neighborhood Health Center. In production this login would go through Okta with SAML SSO and MFA. For the demo we're using native credentials, but the integration path is already defined.

*[After login, on the patient list]*

Notice that Dr. Alex lands directly on the patient list. We've configured a per-user default landing page, so different roles see different views immediately on login — providers see patients, payers see their roster, and administrators see the audit dashboard.

*[Search for Jordan Riley]*

I'm going to search for our first demo patient — Jordan Riley, date of birth March 12th, 1985.

*[Open the chart]*

You can see across the top her MRN, the source organization — Neighborhood Health Center — her SSN, and her Medicaid identifier. These are pulled directly from the FHIR Patient resource identifiers.

Notice the green banner at the top. Jordan Riley has opted in to data sharing. That consent status is evaluated by the AccessPolicy layer before any data is returned — it's not a UI toggle, it's enforced at the API level.

Her Timeline, conditions, medications, and labs are all fully visible. This is the experience a provider gets with a fully consented patient."

---

### Act 2 — Consent Enforcement

*[Still as Dr. Alex, search for Taylor Smith]*

"Now let's look at what happens with a patient who has not declared a consent preference.

I'm searching for Taylor Smith, date of birth July 24th, 1992.

*[Open the chart — yellow banner shows, chart is blocked]*

You can see immediately the banner changes to yellow — 'Consent not declared.' The chart content is hidden. Dr. Alex cannot see Taylor's clinical data.

This is enforced at the FHIR AccessPolicy layer. The portal is not hiding the data with CSS — the API is literally returning no clinical resources until consent is established or access is justified.

Now — let's say this is an emergency.

*[Click Break the Glass]*

Dr. Alex clicks 'Break the Glass' and enters a clinical justification. In a real scenario this might be 'Unresponsive patient brought in by ambulance.'

*[Submit — chart loads]*

The chart loads. Access is granted. And critically — that action just created an AuditEvent in the system. Every break-glass access is timestamped, attributed to the specific provider, and permanently on record.

*[2c — Update consent]*

Now let's say Taylor comes around and wants to update her consent. Dr. Alex clicks 'Update consent', changes the status to opt-in, and saves. Taylor is now a consented patient going forward.

*[2d — Casey Riverton]*

One more consent scenario. I'm opening Casey Riverton — date of birth November 5th, 1978.

*[Red banner shows, but chart loads]*

Casey has opted out of data sharing — red banner. But notice the chart is still visible. That's the Medicaid override policy. Casey is a Medicaid beneficiary, and under Nevada's rules, Medicaid-related care coordination access is permitted regardless of general consent status. The banner tells you exactly why: 'Access permitted by Medicaid override policy.'

This is all configuration — no custom authorization code."

---

### Act 3 — Roster-Based Payer Access

*[Log out, log in as Sarah]*

"Now let's switch to the payer perspective. I'm logging in as Sarah Williams, a care coordinator at Silver State Plan.

*[Sarah lands on Roster dashboard]*

Sarah lands directly on her roster dashboard — a filtered view of encounters for her assigned patient population. She can see visits from the last 30 days, filter by visit type, sort by date or patient name.

*[Try to search for Taylor Smith]*

Let me show you what happens when Sarah tries to access a patient outside her roster. I'll search for Taylor Smith.

*[No results]*

No results. Taylor Smith is assigned to High Desert Health, not Silver State Plan. Sarah's AccessPolicy is parameterized against her specific roster group. The FHIR search itself is scoped — Sarah's query is incapable of returning patients outside her group.

*[Switch to Gaps in Care]*

In the Gaps in Care tab, Sarah can see patients who have outstanding clinical needs. Here's a diabetic patient who hasn't had an A1C lab in over a year. Here's a patient on a chronic medication who hasn't refilled in over 90 days.

These gaps are derived directly from FHIR Condition, Observation, and MedicationRequest resources. No separate rules engine, no data warehouse — the gap logic runs against the live FHIR data."

---

### Act 4 — CDR Document View

*[Log in as Dr. Alex, open Jordan Riley, click Timeline]*

"Let's go back to Jordan Riley's chart and look at the clinical data view.

*[Show Timeline with conditions, observations, encounters]*

On the Timeline tab you can see Jordan's full clinical picture — her problem list with active conditions, lab observations including her A1C and cholesterol, and her encounter history.

In production, all of this data flows from Smile's CDR into the portal via FHIR. Smile ingests from EHRs, labs, payers, and public health feeds. The portal consumes it through standard FHIR APIs. The two systems stay loosely coupled — Smile owns the source of truth, HiiveCare owns the workflow and presentation layer."

---

### Act 5 — CDA Export

*[Click Export tab on Jordan Riley's chart]*

"Now let's look at data export. Nevada HIE needs to support document exchange with external systems — other HIEs, payers, specialists.

*[Show the export format options]*

The portal supports four export formats. FHIR Everything gives you a complete machine-readable bundle. Patient Summary gives you an IPS — an International Patient Summary focused on the most clinically relevant information. C-CDA is the standard format used by virtually every US EHR — Epic, Cerner, Athena — for interoperability. And C-CDA Referral is scoped specifically for care transitions.

*[Select C-CDA and click Export]*

I'll select C-CDA and click Export. Medplum calls the native dollar-sign ccda-export operation on the server and returns a standards-compliant CDA XML document.

This is a native Medplum capability — no custom conversion code. The document can be shared with any system that speaks HL7 CDA."

---

### Act 6 — Audit and Reporting

*[Log out, log in as Nevada Admin, click Audit in left nav]*

"Now let's look at the administrative side. I'm logging in as the Nevada HIE administrator.

*[Audit dashboard loads]*

The Audit dashboard gives a real-time view of portal activity. You can see total events, reads, updates, and creates. Every action a user takes in the portal — opening a chart, exporting a document, updating a consent — generates a FHIR AuditEvent automatically.

*[Apply filter for Dr. Alex]*

I'll filter to show just Dr. Alex's activity. You can see the break-glass event from earlier, the consent update, and every patient record she accessed.

*[Click Export CSV]*

We can export this to CSV for compliance reporting or integration with a SIEM. The data is always available via FHIR search, so it can also be pulled by external compliance tools programmatically.

This is all built on Medplum's native AuditEvent infrastructure. No custom logging middleware, no separate audit database."

---

### Act 6b — Hiive AI Insights

*[Switch to the Hiive AI Insights tab — open on HIE Intelligence → Executive Dashboards → Analytics Dashboard]*

"The portal gives providers and payers a per-patient workflow view. But Nevada HIE also needs operational intelligence — usage trends, compliance metrics, population health at scale. That's what Hiive AI Insights provides.

Hiive AI Insights is not a separate product. It's an integrated analytics module inside HiiveCare — the reporting layer that sits on top of the same data the portal runs on.

*[Point to the KPI tiles: active users, chart views, queries, uptime]*

Right now we're looking at the Executive Dashboard. You can see 1,600 active users, over 22,000 chart views, 25,000 queries, and 99% platform uptime. These are the operational metrics Nevada HIE leadership would review on a regular basis.

*[Point to the Records Viewed vs Exported trend and Break Glass Events chart]*

The trend charts show records viewed versus exported over time — useful for spotting anomalies — and a separate view of break-glass events month over month, which is a key HIPAA compliance indicator.

*[Switch to Nevada HIE → Roster & Population Analytics → Member worklist]*

Now let's look at population analytics. This is the roster and care gap view — scoped to a specific payer or health plan.

2,000 attributed members. 3,300 open care gaps. 440 patients flagged as high or critical risk.

*[Point to the Care-gap opportunity chart]*

The care-gap opportunity chart breaks down gap types — A1C overdue, blood pressure not controlled, mammogram overdue, diabetic retinal exam. This is exactly the kind of report a payer care manager or Nevada HIE operations team would use to prioritize outreach.

*[Point to the Risk vs. open gaps scatter]*

And this scatter plot overlays risk score against open gap count — so you can immediately identify the highest-risk patients with the most unaddressed gaps. Those are your intervention priorities.

*[Switch to Statewide Exchange Performance → Most active participants]*

Finally, the statewide participation view. 403 provisioned users, 378 active, top contributing organizations ranked by event volume. On the right you can see the most prevalent conditions across the population — hypertension, hyperlipidemia, Type 2 diabetes — which feeds population health prioritization.

All of this comes from the same FHIR event stream as the portal. One data layer, two surfaces — the clinical workflow portal and the analytics module."

---

### Act 7 — User Provisioning

*[Open http://127.0.0.1:3001, log in as admin, select Hiive Health Demo]*

"Finally, let me show you the administrative side of user management.

*[Navigate to Admin → Project → Users]*

This is the user management console. You can see all project members, filter by role type — practitioner, patient, related person — and manage access.

*[Click Dr. Alex's row]*

When I open Dr. Alex's membership, I can see her linked profile, and I can assign or change her Access Policy. The Access Policy is what controls exactly which FHIR resource types and patient compartments she can read and write. This is the same mechanism that enforces the consent rules and roster scoping we saw earlier.

*[Show Bulk Invite]*

For onboarding, we support bulk invite via CSV. You provide first name, last name, email, and role. The system creates the account, sends the invitation, and assigns the access policy — all in one operation.

This is how you would onboard a cohort of new providers or a payer organization's care coordination team at scale."

---

### Closing

"So what you've seen today is a fully functional portal that satisfies Nevada HIE's core requirements — provider access, consent enforcement, roster-based payer access, clinical document exchange, and audit reporting — using FHIR-native infrastructure with no proprietary lock-in.

The production path is clear: Smile Digital Health brings the CDR, Hiive Health brings the portal and workflow layer, and Okta brings enterprise identity. Each piece is independently deployable and replaces without rewiring the others.

We're ready to move to the next phase. Happy to take any questions."
