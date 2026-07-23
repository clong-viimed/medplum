// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, FileButton, Group, Loader, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { convertCcdaToFhir, parseXml } from '@medplum/ccda';
import { normalizeErrorString } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export function CcdaImportPage(): JSX.Element {
  const medplum = useMedplum();
  const [xml, setXml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<Bundle | undefined>();

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
      const parsed = parseXml(xml);
      const bundle = convertCcdaToFhir(parsed);

      const entries =
        bundle.entry
          ?.map((entry) => {
            const resource = entry.resource;
            if (!resource) {
              return undefined;
            }
            const url = resource.id ? `${resource.resourceType}/${resource.id}` : resource.resourceType;
            return {
              request: { method: resource.id ? ('PUT' as const) : ('POST' as const), url },
              resource,
            };
          })
          .filter((e): e is { request: { method: 'POST' | 'PUT'; url: string }; resource: Resource } => !!e) ?? [];

      const response = await medplum.executeBatch({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: entries,
      });

      showNotification({
        title: 'C-CDA imported',
        message: `Imported ${response.entry?.length ?? 0} resources`,
        color: 'green',
      });
      setLastResult(response);
    } catch (err) {
      const message = normalizeErrorString(err);
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
          Upload or paste a C-CDA XML document to convert it to FHIR resources and import it into the CDR.
        </Text>

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
          <Button onClick={handleImport} loading={loading} disabled={!xml.trim()}>
            Import
          </Button>
        </Group>

        {loading && <Loader />}

        {lastResult && (
          <Alert color="green">
            Imported {lastResult.entry?.length ?? 0} resources. Open the patient timeline to review the imported
            data.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
