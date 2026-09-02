export const NEVADA_BREAK_GLASS_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Nevada HIE Provider Break-Glass Access Policy',
  resource: [
    {
      resourceType: 'Patient',
      interaction: ['read', 'search', 'history', 'vread'],
      criteria: 'Patient?_id=%patient.id',
    },
    {
      resourceType: 'Encounter',
      interaction: ['read', 'search', 'history', 'vread'],
      criteria: 'Encounter?_compartment=Patient/%patient.id',
    },
    {
      resourceType: 'Consent',
      interaction: ['read', 'search', 'history', 'vread'],
      criteria: 'Consent?_compartment=Patient/%patient.id',
    },
    {
      resourceType: 'AuditEvent',
      interaction: ['create', 'read', 'search', 'history', 'vread'],
    },
    {
      resourceType: 'Provenance',
      interaction: ['read', 'search', 'history', 'vread'],
    },
  ],
};

export function getPolicyResource(policy, resourceType) {
  return policy.resource?.find((entry) => entry.resourceType === resourceType);
}

export function hasInteraction(policy, resourceType, interaction) {
  return policy.resource?.some(
    (entry) => entry.resourceType === resourceType && entry.interaction?.includes(interaction)
  ) ?? false;
}

export function hasCriteria(policy, resourceType, criteria) {
  return policy.resource?.some(
    (entry) => entry.resourceType === resourceType && entry.criteria === criteria
  ) ?? false;
}