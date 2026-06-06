# Medplum Bot Action Catalog for No-Code Builder Design

This document lists what a Medplum Bot can do in this environment and groups actions into no-code builder categories.

Scope notes:
- Actions depend on project features, runtime settings, and AccessPolicy.
- A Bot can only read or write resources allowed by the Bot membership policy, or by the triggering user policy when runAsUser is true.
- This catalog is based on repository docs and generated FHIR types in this codebase.

## Group A: Invocation and Trigger Actions

A Bot can be triggered by:
- Manual execute from the Bot Editor.
- Direct HTTP execute via Bot execute operation.
- Subscription trigger on resource create or update events.
- Scheduled trigger via cron expression.
- Custom FHIR operation invocation through OperationDefinition linked to a Bot.
- External webhook delivery to Bot execute endpoint.

## Group B: Input and Output Actions

A Bot can accept input as:
- FHIR JSON resource input.
- HL7 v2 payload input.
- Plain text.
- Generic JSON object.
- URL-encoded form values.

A Bot can return:
- FHIR resources.
- Parameters-style outputs from custom operations.
- Primitive values and JSON payloads.
- OperationOutcome responses for controlled errors.

## Group C: FHIR Data Actions

A Bot can perform standard SDK-backed FHIR operations (subject to AccessPolicy):
- Create resource.
- Read resource by id.
- Search resources.
- Update resource.
- Patch resource.
- Delete resource.
- Transaction and batch workflows.
- Execute FHIR operations on supported endpoints.

## Group D: Integration Actions

A Bot can integrate with external systems by:
- Making outbound HTTP calls to APIs.
- Consuming inbound webhooks.
- Verifying webhook signatures.
- Uploading files via multipart form-data.
- Connecting to SFTP endpoints and transferring files.
- Transforming incoming non-FHIR payloads (including HL7) into FHIR.

## Group E: Document and File Actions

A Bot can:
- Create PDF documents as FHIR Binary resources.
- Download and re-use Binary content.
- Attach Binary content to other FHIR resources (for example Media or DocumentReference workflows).
- Upload generated files to external systems.

## Group F: Security and Execution Context Actions

A Bot can:
- Run with Bot membership permissions.
- Run as the triggering user when runAsUser is enabled.
- Read configured bot secrets for external authentication and signing verification.
- Be constrained by project-level and bot-level access policies.

## Group G: Operational Actions

A Bot can:
- Be saved and deployed as executable code.
- Run on different runtimes configured by project or bot settings.
- Emit logs and outcomes visible through audit and monitoring workflows.
- Support local development execution for test cycles.

## Group H: Full FHIR Resource Scope for Create and Update

If AccessPolicy allows it, a Bot can create or update any resource type in the generated Resource union for this codebase.

### Core Clinical and Workflow
- Account
- AdverseEvent
- AllergyIntolerance
- Appointment
- AppointmentResponse
- CarePlan
- CareTeam
- ClinicalImpression
- Communication
- CommunicationRequest
- Condition
- Consent
- DetectedIssue
- Device
- DeviceDefinition
- DeviceMetric
- DeviceRequest
- DeviceUseStatement
- DiagnosticReport
- Encounter
- EpisodeOfCare
- FamilyMemberHistory
- Flag
- Goal
- Group
- HealthcareService
- ImagingStudy
- Immunization
- ImmunizationEvaluation
- ImmunizationRecommendation
- Invoice
- List
- Media
- Medication
- MedicationAdministration
- MedicationDispense
- MedicationKnowledge
- MedicationRequest
- MedicationStatement
- NutritionOrder
- Observation
- ObservationDefinition
- Organization
- OrganizationAffiliation
- Patient
- Person
- PlanDefinition
- Practitioner
- PractitionerRole
- Procedure
- Questionnaire
- QuestionnaireResponse
- RelatedPerson
- RequestGroup
- Schedule
- ServiceRequest
- Slot
- Specimen
- SpecimenDefinition
- Subscription
- SubscriptionStatus
- SupplyDelivery
- SupplyRequest
- Task
- VisionPrescription

### Financial and Coverage
- ChargeItem
- ChargeItemDefinition
- Claim
- ClaimResponse
- Coverage
- CoverageEligibilityRequest
- CoverageEligibilityResponse
- EnrollmentRequest
- EnrollmentResponse
- ExplanationOfBenefit
- InsurancePlan
- PaymentNotice
- PaymentReconciliation

### Knowledge, Terminology, and Definitions
- ActivityDefinition
- CapabilityStatement
- CatalogEntry
- CodeSystem
- CompartmentDefinition
- ConceptMap
- EffectEvidenceSynthesis
- EventDefinition
- Evidence
- EvidenceVariable
- ExampleScenario
- GraphDefinition
- GuidanceResponse
- ImplementationGuide
- Library
- Measure
- MeasureReport
- MessageDefinition
- NamingSystem
- OperationDefinition
- ResearchDefinition
- ResearchElementDefinition
- SearchParameter
- StructureDefinition
- StructureMap
- TerminologyCapabilities
- TestReport
- TestScript
- ValueSet

### Research and Study
- ResearchStudy
- ResearchSubject
- RiskAssessment
- RiskEvidenceSynthesis

### Documents and Content
- Basic
- Binary
- BodyStructure
- Composition
- Contract
- DocumentManifest
- DocumentReference
- Endpoint
- MessageHeader
- MolecularSequence
- Provenance

### Substances and Products
- BiologicallyDerivedProduct
- MedicinalProduct
- MedicinalProductAuthorization
- MedicinalProductContraindication
- MedicinalProductIndication
- MedicinalProductIngredient
- MedicinalProductInteraction
- MedicinalProductManufactured
- MedicinalProductPackaged
- MedicinalProductPharmaceutical
- MedicinalProductUndesirableEffect
- Substance
- SubstanceNucleicAcid
- SubstancePolymer
- SubstanceProtein
- SubstanceReferenceInformation
- SubstanceSourceMaterial
- SubstanceSpecification

### Identity, Access, and Medplum Platform Resources
- AccessPolicy
- Agent
- AsyncJob
- AuditEvent
- Bot
- BulkDataExport
- ClientApplication
- DomainConfiguration
- JsonWebKey
- Login
- Package
- PackageInstallation
- PackageRelease
- Project
- ProjectMembership
- SmartAppLaunch
- User
- UserConfiguration
- UserSecurityRequest

### Transport and Utility
- Bundle
- Parameters
- Linkage
- VerificationResult

## Group I: No-Code Builder Primitive Blocks

For a no-code bot builder, these become reusable action nodes:
- Trigger node: manual, subscription, cron, webhook, custom operation.
- Parse node: FHIR, HL7, JSON, text.
- Query node: read/search/list resources.
- Decision node: conditional branching by field values and business rules.
- Mutation node: create/update/patch/delete resources.
- Transaction node: grouped writes.
- Integration node: HTTP call, SFTP transfer.
- File node: create PDF, upload Binary, attach file.
- Security node: read secret, validate signature.
- Response node: return resource, parameters, or operation outcome.
- Observability node: log status and structured execution outcomes.

## Suggested Next Step

Create a first-pass no-code schema that maps each primitive block above to:
- Required inputs
- Optional inputs
- Output shape
- Error behavior
- Permission prerequisites
