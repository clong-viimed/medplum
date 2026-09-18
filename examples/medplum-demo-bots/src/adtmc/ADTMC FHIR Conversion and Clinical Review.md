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