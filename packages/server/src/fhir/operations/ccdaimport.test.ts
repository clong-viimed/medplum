// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, Condition, DocumentReference, Encounter, Group, Observation, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

const SAMPLE_CCDA = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1"/>
  <id root="12345678-1234-1234-1234-123456789012"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of episode note"/>
  <title>Nevada Demo C-CDA</title>
  <effectiveTime value="20260728120000+0000"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.1" extension="123-45-6789"/>
      <patient>
        <name><given>Jordan</given><family>Riley</family></name>
        <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="19850315"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
          <title>Problems</title>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <value xsi:type="CD" code="I10" codeSystem="2.16.840.1.113883.6.90" displayName="Essential hypertension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                  <effectiveTime><low value="20200115"/></effectiveTime>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
      <component>
        <section>
          <code code="30954-2" codeSystem="2.16.840.1.113883.6.1" displayName="Results"/>
          <title>Results</title>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <effectiveTime value="20260728110000+0000"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <code code="14957-5" codeSystem="2.16.840.1.113883.6.1" displayName="Urea nitrogen [Mass/volume] in Serum or Plasma"/>
                  <value xsi:type="PQ" value="18" unit="mg/dL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>
      <component>
        <section>
          <code code="46240-8" codeSystem="2.16.840.1.113883.6.1" displayName="Encounters"/>
          <title>Encounters</title>
          <entry>
            <encounter classCode="ENC" moodCode="EVN">
              <code code="99213" codeSystem="2.16.840.1.113883.6.12" displayName="Office Visit"/>
              <effectiveTime><low value="20260728110000+0000"/><high value="20260728113000+0000"/></effectiveTime>
            </encounter>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;

describe('C-CDA Import', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const groupRes = await request(app)
      .post('/fhir/R4/Group')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Group', type: 'person', actual: true } satisfies Group);
    expect(groupRes.status).toBe(201);

    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Jordan'], family: 'Riley' }],
        meta: { account: { reference: `Group/${groupRes.body.id}` }, accounts: [{ reference: `Group/${groupRes.body.id}` }] },
      } satisfies Patient);
    expect(patientRes.status).toBe(201);

    const importRes = await request(app)
      .post(`/fhir/R4/Patient/${patientRes.body.id}/$ccda-import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.CDA_XML)
      .send(SAMPLE_CCDA);

    expect(importRes.status).toBe(200);
    expect(importRes.body.resourceType).toBe('Bundle');

    const resources =
      (importRes.body as Bundle).entry?.map((entry) => entry.resource).filter((resource): resource is NonNullable<typeof resource> => !!resource) ?? [];
    const condition = resources.find((resource) => resource.resourceType === 'Condition') as Condition | undefined;
    const observation = resources.find((resource) => resource.resourceType === 'Observation') as Observation | undefined;
    const encounter = resources.find((resource) => resource.resourceType === 'Encounter') as Encounter | undefined;
    const documentReference = resources.find(
      (resource) => resource.resourceType === 'DocumentReference'
    ) as DocumentReference | undefined;

    expect(condition?.subject?.reference).toBe(`Patient/${patientRes.body.id}`);
    expect(condition?.code?.coding?.[0]?.code).toBe('I10');
    expect(observation?.subject?.reference).toBe(`Patient/${patientRes.body.id}`);
    expect(observation?.valueQuantity?.value).toBe(18);
    expect(encounter?.subject?.reference).toBe(`Patient/${patientRes.body.id}`);
    expect(documentReference?.subject?.reference).toBe(`Patient/${patientRes.body.id}`);
    expect(documentReference?.content?.[0]?.attachment?.contentType).toBe(ContentType.CDA_XML);
    expect(documentReference?.meta?.account?.reference).toBe(`Group/${groupRes.body.id}`);
  });

  test('Invalid XML payload', async () => {
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' } satisfies Patient);
    expect(patientRes.status).toBe(201);

    const importRes = await request(app)
      .post(`/fhir/R4/Patient/${patientRes.body.id}/$ccda-import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.CDA_XML)
      .send('not valid xml');

    expect(importRes.status).toBe(400);
  });

  test('Requires authorization', async () => {
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' } satisfies Patient);
    expect(patientRes.status).toBe(201);

    const importRes = await request(app)
      .post(`/fhir/R4/Patient/${patientRes.body.id}/$ccda-import`)
      .set('Content-Type', ContentType.CDA_XML)
      .send(SAMPLE_CCDA);

    expect(importRes.status).toBe(401);
  });
});