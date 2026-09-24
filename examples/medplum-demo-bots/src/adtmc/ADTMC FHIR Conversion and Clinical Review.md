# ADTMC FHIR Conversion and Clinical Review

## Purpose

This document describes how the static A-01 Sore Throat/Hoarseness algorithm
from MEDCOM Pam 40-7-21, pages 19 and 20 is represented as a dynamic, auditable FHIR
workflow. It is intended to support clinical review before the draft workflow
is activated outside the isolated A-01 test project.

This is an implementation of the source algorithm, not a replacement for
clinical judgment, local policy, or emergency escalation procedures.

## From Static Algorithm To Dynamic Workflow

The original algorithm is a decision tree read and applied manually. The FHIR
implementation preserves that clinical sequence while making each screening,
decision, handoff, and follow-up recordable and traceable.

| Static workflow element | Dynamic FHIR representation | Operational result |
| --- | --- | --- |
| Source page | `DocumentReference` | Versioned source evidence is retained with the implementation. |
| Questions and answer choices | `Questionnaire` | Medic records structured, required answers at the point of care. |
| Decision logic | `Library` and `PlanDefinition` | Versioned rules evaluate the completed screen consistently. |
| Completed screening | `QuestionnaireResponse` | The exact patient, encounter, author, answers, and completion status are recorded. |
| Decision result | `ClinicalImpression` | Disposition, decision rule, algorithm ID, version, and source response are retained. |
| Required handoff | `Task` | Work is routed to the appropriate team queue and can be claimed by an individual clinician. |
| Team routing | `CareTeam`, `HealthcareService`, and `PractitionerRole` | A patient can be routed to an Alpha Hall-specific queue rather than a global queue. |

## Implemented A-01 Decision Flow

1. A Medic opens a patient encounter and starts the A-01 screen.
2. The Medic records required coded `Yes` or `No` answers for the five red flags.
3. Any red flag immediately produces the `Provider Now` disposition. DP1 and
   later screening are not shown in this path.
4. If all red flags are absent, the Medic completes DP1 and the applicable
   Strep and additional screens.
5. Completing the screen creates a completed `QuestionnaireResponse`. A
   completed-response `Subscription` invokes the A-01 Bot.
6. The Bot evaluates the versioned rule table and creates one
   `ClinicalImpression` and one handoff `Task`.
7. The Task is routed to the patient's CareTeam-specific `HealthcareService`
   queue when configured, or to the global disposition queue as a fallback.
8. The receiving clinician claims the handoff and opens the linked encounter to
   review the screening record and continue clinical documentation.

The Bot is idempotent: retried processing of the same completed
`QuestionnaireResponse` returns the existing result and Task rather than
creating duplicates.

## Source Translation Convention

Each future ADTMC algorithm, including A-2, must be translated from its
approved PDF source as distinct FHIR elements: source heading and explanatory
text as `Questionnaire` group and display items; table prompt and rows as
display and coded question items; decision gates as `enableWhen`; and stated
dispositions as versioned `Library` and `PlanDefinition` rules. Source wording
must be retained unless a clinician-approved change is recorded and versioned.

## Source-Defined Dispositions

| Trigger | Disposition | Current Task priority | Receiving queue |
| --- | --- | --- | --- |
| Any red flag: shortness of breath, stridor, deviated uvula, drooling/trouble swallowing, or stiff neck | Provider Now | `stat` | Provider Now |
| Symptoms more than 10 days, immunosuppression, inhaled steroid, or fever | Provider Now | `stat` | Provider Now |
| Three or more Strep criteria plus positive rapid strep/culture | AEM Now | `stat` | AEM Now |
| Negative rapid strep/culture with three or more criteria, or zero to two criteria | Minor Care Protocols | `routine` | Minor Care Protocols |

All Provider Now triggers, including red-flag and DP1 responses, receive the
same Task code:

`Provider Now: ADTMC A-01 Sore Throat/Hoarseness`

Its Task description directs the recipient to review and continue clinical
documentation in the linked encounter.

## Clinical Record And Handoff Model

The workflow deliberately separates the routing record from the clinical
record:

- `QuestionnaireResponse`: what the Medic documented.
- `ClinicalImpression`: what the algorithm concluded, including the rule that
  triggered it.
- `Task`: the responsibility to acknowledge and act on the handoff.
- `Encounter`: the practitioner’s ongoing assessment, orders, treatment,
  disposition, and signed clinical documentation.

The Provider application presents `Claim & Open Encounter` for a routed task.
The proposed behavior assigns the handoff to the authenticated Practitioner,
sets it to `in-progress`, and opens the linked encounter. It does not complete
the Task automatically. The practitioner completes it after the clinical action
and encounter documentation are complete.

## Questions For Clinician Review

Record the decision, rationale, reviewer, and any required policy reference for
each question.

| # | Question | Current proposed behavior | Decision / notes |
| --- | --- | --- | --- |
| 1 | Should selecting `Claim & Open Encounter` complete the handoff Task, or should the clinician return later to complete it after clinical work is finished? | Claim assigns the clinician and changes the Task to `in-progress`; completion is explicit after documentation and clinical action. | |
| 2 | For a red-flag result, is `Provider Now` sufficiently urgent, or should the workflow also require a direct verbal/warm handoff, emergency activation, or another escalation action? | A stat Provider Now Task is created and routed. | |
| 3 | Are the five red flags and their wording clinically complete and faithful to the approved local interpretation of the source? | Five source-derived coded questions are required before routing. | |
| 4 | Should Provider Now triggers use the same `stat` priority and queue regardless of whether a red-flag or DP1 response triggered the handoff? | All Provider Now triggers are `stat` and use the shared Provider Now Task code. | |
| 5 | What is the expected maximum acknowledgement and completion interval for Provider Now and AEM Now Tasks? | No timer, escalation, or overdue workflow is implemented yet. | |
| 6 | Who may claim each queue, and what should happen if the intended role is unavailable? | Any authorized queue member can claim; team-specific queues fall back to global queues only when a team queue is not configured. | |
| 7 | What clinical content must the receiving practitioner add before completing the handoff Task and signing the encounter? | The practitioner continues encounter documentation; no structured completion checklist is enforced. | |
| 8 | Should the Task remain open until the encounter is signed, or is a documented clinical action sufficient for Task completion? | Explicit Task completion is independent of the encounter signature. | |
| 9 | Is the Minor Care Protocols outcome intended to create a work Task, an informational result, or both? | A routine Minor Care Protocols Task is currently created. | |
| 10 | Are there local workflow, scope-of-practice, or documentation requirements that must be enforced by role? | Roles and queues route work, but no policy-specific documentation gate is implemented. | |
| 11 | Is optional symptom severity needed in the SOAP Subjective section? It was not part of the original SOAP scope. | The complaint model supports an optional Mild/Moderate/Severe value per complaint, but no extraction or workflow relies on it. Remove the field if clinical review does not require it. | |
| 12 | Where should Clinical Decision Flows appear in the SOAP note template: before SOAP documentation, within a specific section, or as contextual decision support alongside the relevant section? | Clinical Decision Flows currently appear in the encounter workflow outside the SOAP sections. Their placement should support early screening without obscuring or duplicating clinician-authored Subjective, Objective, Assessment, and Plan documentation. | |

## Review Outcomes

The clinical reviewer should approve, revise, or reject each of the following:

- A-01 question wording, required answers, and gating behavior.
- Each rule-to-disposition mapping and its priority.
- The distinction between red-flag and other Provider Now Task labels.
- The claim and completion semantics for routing Tasks.
- Required encounter documentation and sign-off before Task completion.
- Queue membership, fallback routing, acknowledgement expectations, and
  escalation for unclaimed urgent Tasks.

Approved changes should be versioned in the Questionnaire, rule table,
PlanDefinition, and associated tests before deployment.

## Proposed Enhancement: SOAP Assessment And Plan Decision Support

### Problem

The current A-01 workflow records the screening, algorithm conclusion, and routed handoff as a `QuestionnaireResponse`, `ClinicalImpression`, and `Task`. A receiving clinician must search for that result separately while completing the SOAP note. The result is clinically relevant to the encounter but is not visible in the SOAP Assessment or Plan workflow.

### Proposed Behavior

When an A-01 Bot creates a `ClinicalImpression` for an encounter, the Provider application should display an A-01 decision-support panel in both SOAP sections:

| SOAP section | Read-only decision support | Clinician-controlled action |
| --- | --- | --- |
| Assessment | Algorithm ID, version, matched rule, disposition, and guidance from the linked `ClinicalImpression`. | Add the result as a differential-diagnosis consideration or add a separately selected diagnosis. |
| Plan | Disposition, receiving queue, and the source-defined follow-up guidance. | Add, edit, or decline plan text, orders, referrals, patient education, and follow-up actions. |

The panel must link to the completed A-01 `QuestionnaireResponse` and its `ClinicalImpression` so the clinician can review the recorded answers and the specific rule that produced the recommendation.

### Clinical Safety And Data Rules

- A-01 must not automatically create a `Condition`, `CarePlan`, order, prescription, referral, or signed SOAP content.
- The algorithm result is decision support, not a diagnosis or treatment authorization.
- Any clinician-selected differential diagnosis or plan action must remain independently editable, attributable, and auditable in the normal SOAP workflow.
- The existing Bot remains the source of the A-01 `ClinicalImpression` and routed `Task`; this enhancement does not duplicate rule evaluation in the client.
- If no A-01 `ClinicalImpression` exists for the encounter, no A-01 Assessment or Plan panel is shown.

### Delivery Contract

1. Query A-01 `ClinicalImpression` resources for the current encounter, identified by the `urn:hiivehealth:adtmc-questionnaire-response` identifier and A-01 algorithm extensions.
2. Render the linked result in SOAP Assessment and Plan with the rule ID, disposition, guidance, and source-response link.
3. Provide structured clinician actions to add a differential-diagnosis consideration and draft plan text; these actions must require explicit confirmation before persistence.
4. Include the linked `ClinicalImpression` and any clinician-created resources in the final SOAP `Composition` and `Provenance` flow.
5. Test Provider Now, AEM Now, and Minor Care Protocols results, plus the no-result state, to verify that no diagnosis or plan is created automatically.

### Implementation Work Slices

#### Slice 1: A-01 Result Discovery Contract

**Status:** Implemented locally in `medplum-provider` with focused automated coverage.

**Scope:** Define a provider-side query and result model for A-01 `ClinicalImpression` resources associated with the open encounter.

**Deliverable:** A typed hook or data service that loads the most recent A-01 result, resolves its linked `QuestionnaireResponse`, and exposes the algorithm ID, version, matched rule, disposition, guidance, and source-resource references.

**Dependencies:** A completed-response A-01 Bot deployment, an active completed-response `Subscription`, and read access to `ClinicalImpression` and `QuestionnaireResponse` resources.

**Verification:** Focused tests cover no result, one result, multiple historical results, and a result with missing or malformed A-01 extensions. The open encounter shows no A-01 decision-support content when no qualifying result exists.

#### Slice 2: SOAP Assessment Decision-Support Panel

**Status:** Implemented locally in `medplum-provider`.

**Scope:** Render a compact read-only A-01 result panel in the SOAP Assessment section.

**Deliverable:** A panel that displays the algorithm title, version, matched rule, disposition, guidance, and links to the completed response and `ClinicalImpression`.

**Dependencies:** Slice 1.

**Verification:** Each A-01 outcome renders its corresponding rule and guidance. The panel remains read-only and does not create a `Condition`, alter the Assessment `QuestionnaireResponse`, or change the A-01 result.

#### Slice 3: Differential-Diagnosis Consideration Action

**Status:** Implemented locally as a clinician-confirmed, editable SOAP Assessment draft action.

**Scope:** Add a clinician-confirmed action in Assessment for recording an A-01 result as a differential-diagnosis consideration.

**Deliverable:** A structured action that prepopulates only the A-01 rationale and source references, requires the clinician to select or confirm the diagnosis concept, and persists the resulting resource with clear A-01 provenance.

**Dependencies:** Slice 2 and the existing diagnosis selection workflow.

**Verification:** No resource is created until confirmation. The clinician can edit or cancel the proposed differential. A confirmed result is attributable to the clinician and references the source A-01 `ClinicalImpression`; it is not presented as a confirmed diagnosis unless the clinician explicitly records one.

#### Slice 4: SOAP Plan Decision-Support Panel And Draft Action

**Status:** Implemented locally in `medplum-provider`.

**Scope:** Render A-01 guidance in the SOAP Plan section and allow an explicit clinician action to create editable draft plan text.

**Deliverable:** A Plan panel showing the disposition, destination queue, and source-defined guidance, plus an action that copies selected guidance into the Plan draft without automatically creating a `CarePlan`, order, referral, or patient instruction.

**Dependencies:** Slice 1 and the existing SOAP Plan response persistence.

**Verification:** Provider Now, AEM Now, and Minor Care outcomes render correctly. Drafting plan text requires confirmation, remains editable before signing, and cancellation leaves the Plan unchanged.

#### Slice 5: Composition And Provenance Integration

**Status:** Implemented locally; final Composition and signing Provenance include the source A-01 result and completed screen when present.

**Scope:** Preserve the clinical decision-support lineage when the SOAP note is finalized.

**Deliverable:** Final SOAP `Composition` and `Provenance` handling includes references to the source A-01 `ClinicalImpression`, completed `QuestionnaireResponse`, and any clinician-created differential or plan resources.

**Dependencies:** Slices 3 and 4.

**Verification:** A finalized SOAP note contains the required references and provenance. The referenced A-01 result remains immutable, and the record distinguishes algorithm output from clinician-authored Assessment and Plan content.

#### Slice 6: End-To-End Clinical Safety Validation

**Status:** Focused automated provider tests complete. The provider's idempotent SOAP template installer published the full A-01 Questionnaire revision to the active test project. Live validation then completed the all-negative red-flag, DP1, DP2, and additional-screen path and verified the resulting Minor Care `ClinicalImpression`, SOAP Assessment/Plan decision-support panels, and `READY` handoff Task. Existing isolated-project evidence covers Provider Now and AEM Now; those two paths were not re-exercised in this pass.

**Scope:** Validate the complete enhancement against all A-01 dispositions and negative paths.

**Deliverable:** Automated and browser-level scenarios for Provider Now, AEM Now, Minor Care Protocols, no A-01 result, cancelled clinician actions, and signed/locked encounter behavior.

**Dependencies:** Slices 1 through 5.

**Verification:** Every scenario confirms that A-01 decision support is visible and traceable, no diagnosis or treatment resource is auto-created, and all clinician-authored additions remain explicit, editable before signing, and auditable after signing.