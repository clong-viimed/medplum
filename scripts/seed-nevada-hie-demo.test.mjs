import test from 'node:test';
import assert from 'node:assert/strict';

import { getUserProvisioningDecision } from './seed-nevada-hie-demo.mjs';

test('unauthorized invite attempts fail with a clear remediation message', () => {
  const decision = getUserProvisioningDecision('Unauthorized: user invite not allowed for this project', {
    dryRun: false,
  });

  assert.equal(decision.status, 'blocked');
  assert.match(decision.message, /privileged Medplum admin/i);
});

test('dry-run mode skips the admin invite block without failing', () => {
  const decision = getUserProvisioningDecision('Unauthorized: user invite not allowed for this project', {
    dryRun: true,
  });

  assert.equal(decision.status, 'skip');
  assert.match(decision.message, /dry-run/i);
});
