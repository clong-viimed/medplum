// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CcdaImportPage } from './CcdaImportPage';

const SAMPLE_CCDA = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1"/>
  <id root="12345678-1234-1234-1234-123456789012"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of episode note"/>
  <title>Nevada Demo C-CDA</title>
  <effectiveTime value="20260723120000+0000"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.1" extension="123-45-6789"/>
      <addr use="HP"><streetAddressLine>123 Desert Way</streetAddressLine><city>Las Vegas</city><state>NV</state><postalCode>89101</postalCode></addr>
      <telecom value="tel:+1-702-555-0100" use="HP"/>
      <patient>
        <name><given>Jordan</given><family>Riley</family></name>
        <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="19850315"/>
        <raceCode code="2106-3" codeSystem="2.16.840.1.113883.6.238" displayName="White"/>
        <ethnicGroupCode code="2186-5" codeSystem="2.16.840.1.113883.6.238" displayName="Not Hispanic or Latino"/>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="20260723120000+0000"/>
    <assignedAuthor>
      <id root="2.16.840.1.113883.4.6" extension="1234567890"/>
      <assignedPerson><name><prefix>Dr.</prefix><given>Alex</given><family>Smith</family></name></assignedPerson>
    </assignedAuthor>
  </author>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
          <title>Problems</title>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
                  <value xsi:type="CD" code="I10" codeSystem="2.16.840.1.113883.6.90" displayName="Essential hypertension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                  <effectiveTime><low value="20200115"/></effectiveTime>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;

describe('CcdaImportPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  const setup = (): ReturnType<typeof render> =>
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <CcdaImportPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

  test('renders import page', () => {
    setup();
    expect(screen.getByText('Import C-CDA Document')).toBeInTheDocument();
  });

  test('imports C-CDA and shows success', async () => {
    const user = userEvent.setup();
    const executeBatchSpy = vi.spyOn(medplum, 'executeBatch').mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [{ response: { status: '201' } }],
    });

    setup();
    const input = screen.getByTestId('ccda-xml-input');
    await user.type(input, SAMPLE_CCDA);

    await user.click(screen.getByRole('button', { name: /import/i }));

    await waitFor(() => {
      expect(executeBatchSpy).toHaveBeenCalled();
    });
    expect(screen.getByText(/imported 1 resources/i)).toBeInTheDocument();
  });

  test('shows error for invalid XML', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByTestId('ccda-xml-input');
    await user.type(input, 'not valid xml');
    await user.click(screen.getByRole('button', { name: /import/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
