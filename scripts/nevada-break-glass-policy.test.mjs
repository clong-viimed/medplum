import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEVADA_BREAK_GLASS_POLICY,
  hasCriteria,
  hasInteraction,
} from './nevada-break-glass-policy.mjs';

test('provider patient access is scoped to the temporary profile relationship', () => {
  assert.equal(
    hasCriteria(NEVADA_BREAK_GLASS_POLICY, 'Patient', 'Patient?_id=%patient.id'),
    true,
  );
  assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, 'Patient', 'read'), true);
  assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, 'Patient', 'update'), false);
});

test('clinical resources are scoped through the patient relationship', () => {
  assert.equal(
    hasCriteria(
      NEVADA_BREAK_GLASS_POLICY,
      'Encounter',
      'Encounter?_compartment=Patient/%patient.id',
    ),
    true,
  );
  assert.equal(
    hasCriteria(
      NEVADA_BREAK_GLASS_POLICY,
      'Consent',
      'Consent?_compartment=Patient/%patient.id',
    ),
    true,
  );
});

test('provider cannot create or update clinical records through this policy', () => {
  for (const resourceType of ['Patient', 'Encounter', 'Consent', 'Provenance']) {
    assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, resourceType, 'create'), false);
    assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, resourceType, 'update'), false);
  }
});

test('audit events can be recorded and reviewed', () => {
  assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, 'AuditEvent', 'create'), true);
  assert.equal(hasInteraction(NEVADA_BREAK_GLASS_POLICY, 'AuditEvent', 'read'), true);
});