#!/usr/bin/env node
import { convertCcdaToFhir, convertXmlToCcda } from '@medplum/ccda';
import { readFileSync } from 'node:fs';

const xmlPath = process.argv[2] || '/Users/paulwinterling/Desktop/sample-ccda copy.xml';

try {
  const xml = readFileSync(xmlPath, 'utf-8');
  const parsed = convertXmlToCcda(xml);
  const bundle = convertCcdaToFhir(parsed);

  console.log('Bundle type:', bundle.type);
  console.log('Entries:', bundle.entry?.length ?? 0);
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource;
    if (!r) continue;
    const identifier = r.identifier?.[0]?.value ?? r.identifier?.[0]?.system ?? '';
    console.log(`  ${r.resourceType}/${r.id ?? '(no id)'} ${identifier}`);
  }

  console.log('\nFull bundle:');
  console.log(JSON.stringify(bundle, null, 2));
} catch (err) {
  console.error('Conversion failed:', err.message);
  console.error(err.stack);
}
