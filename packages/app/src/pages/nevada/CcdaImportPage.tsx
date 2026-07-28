// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, FileButton, Group, Loader, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType, normalizeErrorString } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

export function CcdaImportPage(): JSX.Element {
  const medplum = useMedplum();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patient') ?? undefined;
  const [xml, setXml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<OperationOutcome | undefined>();

  const handleFileSelect = (file: File | null): void => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (event): void => {
      const contents = event.target?.result;
      if (typeof contents === 'string') {
        setXml(contents);
        setError(undefined);
      }
    };
    reader.onerror = (): void => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleImport = async (): Promise<void> => {
    if (!xml.trim()) {
      showNotification({ title: 'No document', message: 'Paste or upload a C-CDA XML document.', color: 'red' });
      return;
    }

    setLoading(true);
    setError(undefined);
    setLastResult(undefined);

    try {
      if (!patientId) {
        throw new Error('Native C-CDA import requires a patient context. Open Import C-CDA from a patient chart.');
      }

      const response = await medplum.post<OperationOutcome>(
        medplum.fhirUrl('Patient', patientId, '$ccda-import'),
        xml,
        ContentType.CDA_XML,
        {
          cache: 'no-cache',
        }
      );

      setLastResult(response);
      showNotification({
        title: 'C-CDA imported',
        message: 'The native Medplum $ccda-import operation completed.',
        color: 'green',
      });
    } catch (err) {
      const message =
        normalizeErrorString(err) === 'Not found'
          ? 'Native Medplum $ccda-import is not available on the configured backend.'
          : normalizeErrorString(err);
      setError(message);
      showNotification({ title: 'Import failed', message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="xl">
      <Stack gap="md">
        <Title order={2}>Import C-CDA Document</Title>
        <Text c="dimmed">
          Upload or paste a C-CDA XML document to import it with Medplum&apos;s native patient $ccda-import operation.
        </Text>

        {!patientId && (
          <Alert color="yellow">
            Open this page from a patient chart to provide the patient context required by Medplum&apos;s native import.
          </Alert>
        )}

        <Group>
          <FileButton onChange={handleFileSelect} accept=".xml,.txt">
            {(props) => (
              <Button {...props} variant="outline">
                Select C-CDA file
              </Button>
            )}
          </FileButton>
        </Group>

        <Textarea
          label="C-CDA XML"
          placeholder="Paste C-CDA XML here..."
          value={xml}
          onChange={(e) => setXml(e.currentTarget.value)}
          minRows={12}
          data-testid="ccda-xml-input"
        />

        {error && <Alert color="red">{error}</Alert>}

        <Group>
          <Button onClick={handleImport} loading={loading} disabled={!xml.trim() || !patientId}>
            Import
          </Button>
        </Group>

        {loading && <Loader />}

        {lastResult && (
          <Alert color="green">
            Native import completed. Open the patient timeline to review the imported data.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
