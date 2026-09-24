# A-01 Sore Throat Deployment

This package is a draft implementation of MEDCOM Pam 40-7-21, pages 19 and 20. The
authoritative source PDF is at
`documents/adtmc/source/ADTMC-MEDCOM-Pam-40-7-21.pdf`.

## Publish Prerequisites

Create an isolated Medplum test project and a Bot named `adtmc-a01-sore-throat`.
Set its generated ID in `medplum.config.json`; do not commit that project-specific
ID. The Bot access policy must be limited to reading `QuestionnaireResponse`,
`Patient`, `Encounter`, `Practitioner`, `PractitionerRole`, and `PlanDefinition`,
and creating or searching `ClinicalImpression` and `Task` resources.

Publish matching draft resources before activating the Bot:

- `DocumentReference/adtmc-medcom-pam-40-7-21-pages-19-20`, containing pages 19
  and 20 of the source PDF or a reference to its controlled binary.
- `Questionnaire/a01-sore-throat`, using `a01SoreThroatQuestionnaire`.
- `Library/a01-sore-throat-rules`, containing the versioned rule table.
- `PlanDefinition/a01-sore-throat`, using `a01SoreThroatPlanDefinition`.
- `HealthcareService` resources for `provider-now-queue`, `aem-now-queue`, and
  `minor-care-protocols-queue`.

Create a `Subscription` that invokes the A-01 Bot only when a
`QuestionnaireResponse` reaches `completed` status and references
`https://ehr.hiivehealth.net/fhir/Questionnaire/a01-sore-throat|1.0.0`.
The exact subscription channel configuration is environment-owned because it
references the created Bot resource.

## Deploy And Test

```sh
npm run build
npx medplum bot deploy adtmc-a01-sore-throat
```

In the test project, create an active patient encounter and submit a completed
QuestionnaireResponse using the A-01 canonical questionnaire URL and version.
Verify the resulting `ClinicalImpression` and `Task` carry the response ID
identifier, algorithm ID, version, rule ID, and disposition. Re-submit the same
response event and verify no second `ClinicalImpression` or `Task` is created.

Exercise the source-defined outcomes: Provider Now, AEM Now after a positive
rapid strep/culture test with three or more criteria, and Minor Care Protocols
after either a negative test or zero to two criteria. Do not activate this draft
package outside the isolated test project until source-fidelity and operational
reviews are complete.

## Isolated Test Deployment Record

The following resources were published only to the `ADTMC A-01 Test` project
(`1032f06c-9d68-4c51-9674-1028c4601794`):

- Questionnaire: `Questionnaire/cd70fea9-c379-4c01-a5da-ae6a169b3929`
- Rule Library: `Library/31c91f6f-0b23-4031-9ed9-3799385a54ff`
- PlanDefinition: `PlanDefinition/4588c2fb-1ef6-4cda-983c-edd35907d59b`
- A-01 Bot: `Bot/de11f889-3b5d-447d-8b28-510460e04606`
- Completed-response Subscription: `Subscription/0aa43d14-667a-4825-a184-dba041005905`
- Routing queues: Provider Now `HealthcareService/d856843f-2c19-4d1e-b0a9-e1e95408f3f7`, AEM Now `HealthcareService/68be0a23-16bf-4237-a982-ca35ed63ba74`, and Minor Care Protocols `HealthcareService/0126854e-95fd-44aa-bee4-2f89cf1987c7`

The deployed Bot uses the self-hosted server's `vmcontext` runtime. On the test
patient and active encounter, the completed response
`QuestionnaireResponse/6842b5d9-7756-4bf0-ac47-2c25bc026294` contained three
strep criteria and a positive rapid strep/culture result. It created:

- `ClinicalImpression/51cd50e2-6c11-49ad-a3c2-d243f9515546`
- `Task/78ebdbb1-87d1-4aa6-a587-cce420cfcc5c`, owned by the AEM Now queue

Both artifacts carry algorithm `A-01`, version `1.0.0`, disposition `aem-now`,
and rule `aem-now-positive-rapid-strep-or-culture`. Replaying the same response
returned the existing artifacts with `created: false`, confirming idempotency.

The controlled source PDF is attached to
`DocumentReference/9257b283-2f6b-4aed-8a44-f98be0c06697` in private Medplum
binary storage. The following completed-response Subscription tests also created
one impression and one idempotent handoff Task each:

- Provider Now, shortness of breath:
  `QuestionnaireResponse/5235713b-cf5c-4fec-9a7c-a0f2d6deebed` ->
  `Task/6d1be6af-179a-4f50-8afd-e30a1e9a83f9`, owned by Provider Now, rule
  `provider-now-shortness-of-breath`.
- Minor Care, negative rapid strep/culture with three criteria:
  `QuestionnaireResponse/176ef88e-964c-42e8-990c-936ccd41277d` ->
  `Task/3beec7ed-a639-4c23-b8d8-bab71f1bc326`, owned by Minor Care Protocols,
  rule `minor-care-negative-rapid-strep-or-culture`.
- Minor Care, zero-to-two criteria:
  `QuestionnaireResponse/5a11bcb1-9187-4798-af9e-4156f8aa85be` ->
  `Task/0af0f8cf-2af1-48ec-be20-b2e8f086b331`, owned by Minor Care Protocols,
  rule `minor-care-zero-to-two-strep-criteria`.

The provider application was tested locally against this isolated project at
`http://127.0.0.1:5172`. A project-scoped provider opened the active test
encounter, selected `Start A-01 Sore Throat`, and received an encounter-bound
Task rendering the published canonical questionnaire. Required yes/no prompts
render as explicit `Yes` and `No` radio choices. The `Complete A-01` command
creates a completed QuestionnaireResponse before updating the launch Task, which
preserves the create-only Subscription contract. A coded `Yes` response for
shortness of breath was verified to create Provider Now handoff
`Task/cd0aa277-4881-4fad-bcae-cdfbbb66e261`; replay returned `created: false`.
This deployment remains isolated and is not production-ready.