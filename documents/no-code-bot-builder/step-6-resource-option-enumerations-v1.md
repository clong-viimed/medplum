# Step 6 Resource Option Enumerations v1

This document defines structured-only option lists for Step 6 (Action Blocks) for these resource actions:
- EpisodeOfCare
- Encounter
- ServiceRequest
- Observation
- Task

Scope:
- No free-text entry in Step 6.
- Bot name and bot description remain the only free-text fields in the full wizard.
- All values here are selected from dropdown, radio, checklist, or controlled pickers.

## Global Step 6 Controls

Control: Action type
- Options:
- Upsert by identifier
- Create only

Control: Identifier system
- Options:
- https://hiivecare.example/fhir/NamingSystem/occupational-incident-case-key
- https://hiivecare.example/fhir/NamingSystem/occupational-incident-questionnaire-response

Control: Identifier value strategy
- Options:
- Use computed caseKey
- Use QuestionnaireResponse id

Control: Subject source
- Options:
- QuestionnaireResponse.subject
- Selected fixed reference

Control: Date source
- Options:
- incidentDateTime
- current execution time

## EpisodeOfCare Action

Required fields:
- status
- identifier system
- identifier value strategy
- patient reference source
- period start source

Field: status
- Options:
- planned
- waitlist
- active
- onhold
- finished
- cancelled
- entered-in-error

Field: reasonCode template
- Options:
- incidentType coding from extracted incidentType
- fixed code set entry

Field: type template
- Options:
- same as reasonCode
- fixed type coding

Field: questionnaire reference extension
- Options:
- include origin questionnaire response extension
- do not include extension

Occupational default preset:
- status: active
- identifier system: occupational-incident-case-key
- identifier value strategy: caseKey
- patient reference: QuestionnaireResponse.subject
- period start: incidentDateTime
- reasonCode: incidentType coding
- type: incidentType coding
- extension: include

## Encounter Action

Required fields:
- status
- class
- identifier system
- identifier value strategy
- subject reference source
- episode reference source
- period start
- period end

Field: status
- Options:
- planned
- arrived
- triaged
- in-progress
- onleave
- finished
- cancelled
- entered-in-error
- unknown

Field: class code
- Options:
- AMB (ambulatory)
- EMER (emergency)
- IMP (inpatient encounter)
- VR (virtual)
- HH (home health)

Field: episode reference source
- Options:
- Step output: EpisodeOfCare
- fixed EpisodeOfCare reference

Field: reasonCode source
- Options:
- incidentType coding
- fixed coding

Field: reasonReference source
- Options:
- QuestionnaireResponse reference
- EpisodeOfCare reference

Occupational default preset:
- status: finished
- class: AMB
- identifier system: occupational-incident-case-key
- identifier value strategy: caseKey
- subject reference: QuestionnaireResponse.subject
- episode reference: Step output EpisodeOfCare
- period start/end: incidentDateTime
- reasonCode: incidentType coding
- reasonReference: QuestionnaireResponse

## ServiceRequest Action

Required fields:
- status
- intent
- identifier system
- identifier value strategy
- subject reference source
- encounter reference source
- code template
- authoredOn source

Field: status
- Options:
- draft
- active
- on-hold
- revoked
- completed
- entered-in-error
- unknown

Field: intent
- Options:
- proposal
- plan
- directive
- order
- original-order
- reflex-order
- filler-order
- instance-order
- option

Field: encounter reference source
- Options:
- Step output: Encounter
- fixed Encounter reference

Field: reasonReference source
- Options:
- Step output: EpisodeOfCare
- QuestionnaireResponse reference
- fixed reference

Field: code template
- Options:
- occupational-follow-up
- return-to-work-evaluation
- exposure-follow-up
- fixed coding picker

Field: basedOn source
- Options:
- QuestionnaireResponse reference
- Task reference
- no basedOn

Occupational default preset:
- status: active
- intent: order
- identifier system: occupational-incident-case-key
- identifier value strategy: caseKey
- subject reference: QuestionnaireResponse.subject
- encounter reference: Step output Encounter
- reasonReference: Step output EpisodeOfCare
- code template: occupational-follow-up
- basedOn: QuestionnaireResponse
- authoredOn: incidentDateTime

## Observation Action

Required fields:
- status
- identifier system
- identifier value strategy
- code template
- subject reference source
- effectiveDateTime source
- value type

Field: status
- Options:
- registered
- preliminary
- final
- amended
- corrected
- cancelled
- entered-in-error
- unknown

Field: code template
- Options:
- return-to-work-status
- restriction-type
- custom coded observation

Field: focus source
- Options:
- Step output: EpisodeOfCare
- no focus

Field: derivedFrom source
- Options:
- QuestionnaireResponse reference
- ServiceRequest reference
- no derivedFrom

Field: value type
- Options:
- CodeableConcept
- string
- boolean
- integer
- Quantity

Field: value source
- Options:
- returnToWorkStatus extracted choice
- restrictionType extracted choice
- fixed coding

Field: component templates
- Options:
- restriction-type component
- restriction-summary component
- restriction-limit component
- restriction-effective-date component
- restriction-expiration-date component
- restriction-reevaluation-date component

Occupational default preset:
- status: final
- identifier system: occupational-incident-case-key
- identifier value strategy: caseKey
- code template: return-to-work-status
- subject reference: QuestionnaireResponse.subject
- focus: Step output EpisodeOfCare
- derivedFrom: QuestionnaireResponse
- effectiveDateTime: incidentDateTime
- value type: CodeableConcept
- value source: returnToWorkStatus
- components: all restriction components enabled when source value exists

## Task Action

Required fields:
- status
- intent
- identifier system
- identifier value strategy
- code template
- for reference source
- focus reference source
- authoredOn source
- owner source

Field: status
- Options:
- draft
- requested
- received
- accepted
- rejected
- ready
- cancelled
- in-progress
- on-hold
- failed
- completed
- entered-in-error

Field: intent
- Options:
- unknown
- proposal
- plan
- order
- original-order
- reflex-order
- filler-order
- instance-order
- option

Field: code template
- Options:
- rtw-follow-up
- supervisor-review
- provider-follow-up
- custom task code

Field: for reference source
- Options:
- QuestionnaireResponse.subject
- fixed Patient reference

Field: focus reference source
- Options:
- Step output: EpisodeOfCare
- Step output: ServiceRequest
- fixed reference

Field: encounter reference source
- Options:
- Step output: Encounter
- no encounter

Field: basedOn source
- Options:
- QuestionnaireResponse reference
- ServiceRequest reference
- no basedOn

Field: owner source
- Options:
- fixed practitioner (configured list)
- fixed practitioner role (configured list)
- routing rule output

Occupational default preset:
- status: requested
- intent: order
- identifier system: occupational-incident-case-key
- identifier value strategy: caseKey
- code template: rtw-follow-up
- for reference: QuestionnaireResponse.subject
- focus: Step output EpisodeOfCare
- encounter: Step output Encounter
- basedOn: QuestionnaireResponse
- authoredOn: incidentDateTime
- owner: Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3

## Cross-Action Validation Rules

Validation checks:
- All five actions must use the same case identifier system.
- All five actions must use the same identifier value strategy for idempotency.
- Subject reference must resolve to the same patient across all actions.
- Encounter must reference the EpisodeOfCare action output.
- ServiceRequest must reference Encounter and EpisodeOfCare outputs.
- Observation must reference EpisodeOfCare output when focus is enabled.
- Task must reference EpisodeOfCare and Encounter outputs.

## UX Implementation Notes

For structured-only compliance:
- Use option ids under the hood and render labels in the UI.
- Disable publish if any required field is unset.
- Hide incompatible options based on earlier selections.
- Support presets so admins can choose Occupational Intake and get all defaults preselected.
