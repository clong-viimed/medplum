# Alpha Hall A-01 Test Script

## Purpose

Validate the Medic screening, AEM/Provider routing, task claim, and completion
workflow for the `Alpha Hall Care Team` in `ADTMC A-01 Test`.

## Prerequisites

- Local Provider app is running at `http://127.0.0.1:5172` with project ID
  `1032f06c-9d68-4c51-9674-1028c4601794`.
- Passwords have been set directly in Medplum Admin for the selected accounts.
- The team-aware A-01 Bot deployment is complete. Without it, new handoffs use
  the legacy global queues rather than the Alpha Hall queues.
- Use a fresh active encounter for each scenario. Do not reuse a completed A-01
  Task.

## Demo Accounts

| Role | Accounts |
| --- | --- |
| Medic | `medic.alpha.1@example.com`, `medic.alpha.2@example.com` |
| AEM | `aem.alpha.1@example.com`, `aem.alpha.2@example.com` |
| Provider | `provider.alpha.1@example.com`, `provider.alpha.2@example.com` |

All Alpha Hall demo accounts use the password `medplum_admin`.

## Scenario 1: Medic Routes Provider Now

1. Sign in as `medic.alpha.1@example.com`.
2. Open the Alpha Hall test patient and create or select a fresh active encounter.
3. In `Note & Tasks`, select `Start A-01 Sore Throat`.
4. Answer all five Red Flag questions. Select `Yes` for at least one, such as
   `Shortness of Breath`.
5. Confirm the blocking `Provider Now` modal opens only after the fifth red-flag
   answer is recorded.
6. Confirm DP1 and later A-01 sections are not displayed.
7. Select `Route to Provider Now`.

Expected:

- The A-01 Task and QuestionnaireResponse are completed.
- A new `ADTMC clinical handoff` Task has `priority: stat`.
- Its owner is `Alpha Hall Provider Now Work Queue`.
- The handoff includes `Provider Now.` guidance and the A-01 decision metadata.

## Scenario 2: Provider Claims And Completes

1. Sign out, then sign in as `provider.alpha.1@example.com`.
2. Open the Tasks workspace and filter for the Alpha Hall Provider Now Work Queue.
3. Open the ready handoff created in Scenario 1.
4. Claim the Task by assigning ownership to the current Provider and changing
   its status to `accepted` or `in-progress`.
5. Document the action and change the Task to `completed`.

Expected:

- The Task remains linked to the originating patient, encounter, and A-01
  ClinicalImpression.
- The Task history identifies the Medic requester and the Provider claimant.
- No duplicate handoff Task is created.

## Scenario 3: Medic Routes AEM Now

1. Sign in as `medic.alpha.2@example.com`.
2. Use a new active encounter for the Alpha Hall test patient.
3. Launch A-01 and answer `No` to all five Red Flags.
4. In DP1, answer `No` to symptoms greater than 10 days, immunosuppression,
   inhaled steroid, and fever.
5. In the Strep screen, answer `Yes` to no cough, tonsillar exudate, and swollen
   anterior cervical nodes.
6. Select `Positive` for rapid strep/culture.
7. Select `Complete A-01`.

Expected:

- A new stat handoff is owned by `Alpha Hall AEM Work Queue`.
- Guidance is `AEM Now.`
- The completed response has three strep criteria and a positive test result.

## Scenario 4: AEM Claims And Completes

1. Sign out, then sign in as `aem.alpha.1@example.com`.
2. Open the Tasks workspace and filter for the Alpha Hall AEM Work Queue.
3. Claim the ready handoff and set it to `in-progress`.
4. Complete the clinical action, document the result, and set the Task to
   `completed`.

Expected:

- The Task owner changes from the team queue to the individual AEM on claim.
- The Task retains its encounter, patient, ClinicalImpression, and A-01 rule ID.

## Evidence Checklist

For each scenario, record the IDs or screenshots for:

- QuestionnaireResponse
- ClinicalImpression
- Handoff Task
- Queue owner before claim
- Individual owner and status after claim
- Individual owner and status after completion

## Cleanup

Set test handoff Tasks to `completed` or `cancelled`. Leave the Alpha Hall
team, Location, PractitionerRole records, and work queues in place for repeatable
testing.