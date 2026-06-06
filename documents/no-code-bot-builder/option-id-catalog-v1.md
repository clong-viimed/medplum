# Option ID Catalog v1

This document defines stable option identifiers for the no-code bot builder.

Purpose:
- Keep persisted workflow JSON stable even if UI labels change.
- Enable localization without changing stored configs.
- Support backward-compatible evolution of option sets.

Conventions:
- Option IDs are lowercase with dot-separated namespaces.
- IDs are immutable once released.
- Labels are display-only and may change.
- Deprecated IDs are never reused.

## ID Schema

General pattern:
- domain.category.value

Examples:
- trigger.type.subscription
- content_type.fhir_json
- action.resource.episode_of_care
- task.status.requested

## Core Domains

### Trigger Type
- trigger.type.manual
- trigger.type.subscription
- trigger.type.cron
- trigger.type.webhook
- trigger.type.custom_operation

### Content Type
- content_type.fhir_json
- content_type.hl7_v2
- content_type.json
- content_type.text

### Run Mode
- run_mode.bot_membership
- run_mode.run_as_user

### Action Mode
- action.mode.upsert_by_identifier
- action.mode.create_only

## Occupational Intake Resource Actions

### Action Resource Type
- action.resource.episode_of_care
- action.resource.encounter
- action.resource.service_request
- action.resource.observation
- action.resource.task

### Identifier System
- identifier.system.occupational_case_key
- identifier.system.questionnaire_response_key

### Identifier Value Strategy
- identifier.value.case_key
- identifier.value.questionnaire_response_id

## EpisodeOfCare Option IDs

### Status
- episode.status.planned
- episode.status.waitlist
- episode.status.active
- episode.status.onhold
- episode.status.finished
- episode.status.cancelled
- episode.status.entered_in_error

### Reason and Type Template
- episode.reason.incident_type
- episode.reason.fixed_coding
- episode.type.same_as_reason
- episode.type.fixed_coding

### Extension
- episode.extension.include_origin_questionnaire_response
- episode.extension.none

## Encounter Option IDs

### Status
- encounter.status.planned
- encounter.status.arrived
- encounter.status.triaged
- encounter.status.in_progress
- encounter.status.onleave
- encounter.status.finished
- encounter.status.cancelled
- encounter.status.entered_in_error
- encounter.status.unknown

### Class
- encounter.class.amb
- encounter.class.emer
- encounter.class.imp
- encounter.class.vr
- encounter.class.hh

### Episode Source
- encounter.episode.step_output_episode_of_care
- encounter.episode.fixed_reference

### Reason Source
- encounter.reason_code.incident_type
- encounter.reason_code.fixed_coding
- encounter.reason_reference.questionnaire_response
- encounter.reason_reference.episode_of_care

## ServiceRequest Option IDs

### Status
- service_request.status.draft
- service_request.status.active
- service_request.status.on_hold
- service_request.status.revoked
- service_request.status.completed
- service_request.status.entered_in_error
- service_request.status.unknown

### Intent
- service_request.intent.proposal
- service_request.intent.plan
- service_request.intent.directive
- service_request.intent.order
- service_request.intent.original_order
- service_request.intent.reflex_order
- service_request.intent.filler_order
- service_request.intent.instance_order
- service_request.intent.option

### Reference Sources
- service_request.encounter.step_output_encounter
- service_request.encounter.fixed_reference
- service_request.reason_reference.step_output_episode_of_care
- service_request.reason_reference.questionnaire_response
- service_request.reason_reference.fixed_reference

### Code Template
- service_request.code.occupational_follow_up
- service_request.code.return_to_work_evaluation
- service_request.code.exposure_follow_up
- service_request.code.fixed_coding

### BasedOn
- service_request.based_on.questionnaire_response
- service_request.based_on.task
- service_request.based_on.none

## Observation Option IDs

### Status
- observation.status.registered
- observation.status.preliminary
- observation.status.final
- observation.status.amended
- observation.status.corrected
- observation.status.cancelled
- observation.status.entered_in_error
- observation.status.unknown

### Code Template
- observation.code.return_to_work_status
- observation.code.restriction_type
- observation.code.custom

### Focus and DerivedFrom
- observation.focus.step_output_episode_of_care
- observation.focus.none
- observation.derived_from.questionnaire_response
- observation.derived_from.service_request
- observation.derived_from.none

### Value Type
- observation.value_type.codeable_concept
- observation.value_type.string
- observation.value_type.boolean
- observation.value_type.integer
- observation.value_type.quantity

### Value Source
- observation.value_source.return_to_work_status
- observation.value_source.restriction_type
- observation.value_source.fixed_coding

### Component Templates
- observation.component.restriction_type
- observation.component.restriction_summary
- observation.component.restriction_limit
- observation.component.restriction_effective_date
- observation.component.restriction_expiration_date
- observation.component.restriction_reevaluation_date

## Task Option IDs

### Status
- task.status.draft
- task.status.requested
- task.status.received
- task.status.accepted
- task.status.rejected
- task.status.ready
- task.status.cancelled
- task.status.in_progress
- task.status.on_hold
- task.status.failed
- task.status.completed
- task.status.entered_in_error

### Intent
- task.intent.unknown
- task.intent.proposal
- task.intent.plan
- task.intent.order
- task.intent.original_order
- task.intent.reflex_order
- task.intent.filler_order
- task.intent.instance_order
- task.intent.option

### Code Template
- task.code.rtw_follow_up
- task.code.supervisor_review
- task.code.provider_follow_up
- task.code.custom

### Reference Sources
- task.for.questionnaire_response_subject
- task.for.fixed_patient_reference
- task.focus.step_output_episode_of_care
- task.focus.step_output_service_request
- task.focus.fixed_reference
- task.encounter.step_output_encounter
- task.encounter.none
- task.based_on.questionnaire_response
- task.based_on.service_request
- task.based_on.none

### Owner Source
- task.owner.fixed_practitioner
- task.owner.fixed_practitioner_role
- task.owner.routing_rule

## Preset IDs

### Occupational Incident Intake Preset
- preset.occupational_incident_intake.v1

Preset includes:
- action.resource.episode_of_care
- action.resource.encounter
- action.resource.service_request
- action.resource.observation
- action.resource.task

## Implementation Rule

Persist this structure for choice fields:
- id: stable option id from this catalog
- label: optional display label snapshot for UX only

Example:
{
  "status": {
    "id": "task.status.requested",
    "label": "Requested"
  }
}
