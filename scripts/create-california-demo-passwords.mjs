#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const credentialsPath = resolve('hiive-build-demo-logins.local.md');
const entries = [
  ['California Provider', 'california.provider.demo@example.com'],
  ['California Patient', 'california.patient.demo@example.com'],
  ['California Reviewer', 'california.reviewer.demo@example.com'],
];

const password = () => `${randomBytes(18).toString('base64url')}Aa1!`;
const content = [
  '## California HIE Demo Logins',
  '',
  ...entries.flatMap(([persona, email]) => [`## ${persona}`, `Email: ${email}`, `Password: ${password()}`, '']),
].join('\n');

if (existsSync(credentialsPath)) {
  if (readFileSync(credentialsPath, 'utf8').includes('## California HIE Demo Logins')) {
    throw new Error(`California demo credentials already exist in ${credentialsPath}; refusing to overwrite them.`);
  }
  appendFileSync(credentialsPath, `\n${content}`, { encoding: 'utf8', mode: 0o600 });
  console.log(`Appended local California demo credentials to ${credentialsPath}.`);
} else {
  writeFileSync(credentialsPath, `# Hiive Build Demo App Logins\n\n${content}`, { encoding: 'utf8', mode: 0o600 });
  console.log(`Created local California demo credentials at ${credentialsPath}.`);
}