// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  List,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type { FileWithPath } from '@mantine/dropzone';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import type { InviteRequest } from '@medplum/core';
import { isOperationOutcome, normalizeErrorString } from '@medplum/core';
import type { AccessPolicy, Reference } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCheck, IconUpload, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { AccessPolicyInput } from './AccessPolicyInput';

interface CsvInviteRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: 'Practitioner' | 'Patient' | 'RelatedPerson';
  readonly admin: boolean;
  readonly sendEmail: boolean;
  readonly accessPolicyId?: string;
}

interface ParsedRow extends CsvInviteRow {
  readonly rowNumber: number;
  readonly valid: boolean;
  readonly errors: string[];
}

interface InviteResult {
  readonly rowNumber: number;
  readonly email: string;
  readonly success: boolean;
  readonly message: string;
}

const REQUIRED_COLUMNS = ['firstName', 'lastName', 'email', 'role'];
const VALID_ROLES: readonly ('Practitioner' | 'Patient' | 'RelatedPerson')[] = [
  'Practitioner',
  'Patient',
  'RelatedPerson',
];

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      insideQuotes = true;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((v) => v.trim());
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function parseInviteRows(text: string): { headers: string[]; rows: ParsedRow[]; headerError?: string } {
  const { headers, rows } = parseCsv(text);
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col.toLowerCase()));
  if (missing.length > 0) {
    return {
      headers,
      rows: [],
      headerError: `Missing required columns: ${missing.join(', ')}`,
    };
  }

  const getIndex = (name: string): number => headers.indexOf(name.toLowerCase());
  const firstNameIdx = getIndex('firstName');
  const lastNameIdx = getIndex('lastName');
  const emailIdx = getIndex('email');
  const roleIdx = getIndex('role');
  const adminIdx = getIndex('admin');
  const sendEmailIdx = getIndex('sendEmail');
  const accessPolicyIdIdx = getIndex('accessPolicyId');

  const parsedRows: ParsedRow[] = rows.map((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const firstName = row[firstNameIdx]?.trim() ?? '';
    const lastName = row[lastNameIdx]?.trim() ?? '';
    const email = row[emailIdx]?.trim() ?? '';
    const roleValue = row[roleIdx]?.trim() ?? '';
    const admin = parseBoolean(row[adminIdx]);
    const sendEmail = parseBoolean(row[sendEmailIdx]);
    const accessPolicyId = accessPolicyIdIdx >= 0 ? row[accessPolicyIdIdx]?.trim() || undefined : undefined;

    if (!firstName) {
      errors.push('firstName is required');
    }
    if (!lastName) {
      errors.push('lastName is required');
    }
    if (!email) {
      errors.push('email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('email is invalid');
    }

    const role = VALID_ROLES.includes(roleValue as CsvInviteRow['role']) ? (roleValue as CsvInviteRow['role']) : undefined;
    if (!role) {
      errors.push(`role must be one of ${VALID_ROLES.join(', ')}`);
    }

    return {
      rowNumber,
      firstName,
      lastName,
      email,
      role: role ?? 'Practitioner',
      admin,
      sendEmail,
      accessPolicyId,
      valid: errors.length === 0,
      errors,
    };
  });

  return { headers, rows: parsedRows };
}

function renderStatusCell(row: ParsedRow, result: InviteResult | undefined): JSX.Element {
  if (!row.valid) {
    return (
      <Text c="red" size="sm">
        {row.errors.join(', ')}
      </Text>
    );
  }
  if (result) {
    return (
      <Text c={result.success ? 'green' : 'red'} size="sm">
        {result.success ? 'Invited' : result.message}
      </Text>
    );
  }
  return (
    <Text size="sm" c="dimmed">
      Ready
    </Text>
  );
}

function buildInviteBody(
  row: ParsedRow,
  defaultAccessPolicy: Reference<AccessPolicy> | undefined
): InviteRequest {
  const accessPolicy = row.accessPolicyId
    ? ({ reference: `AccessPolicy/${row.accessPolicyId}` } as Reference<AccessPolicy>)
    : defaultAccessPolicy;

  return {
    resourceType: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    sendEmail: row.sendEmail,
    admin: row.admin,
    accessPolicy,
  };
}

export function BulkInvitePage(): JSX.Element {
  const medplum = useMedplum();
  const [parsed, setParsed] = useState<{ headers: string[]; rows: ParsedRow[]; fileName: string } | null>(null);
  const [defaultAccessPolicy, setDefaultAccessPolicy] = useState<Reference<AccessPolicy> | undefined>(undefined);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const validRows = useMemo(() => parsed?.rows.filter((r) => r.valid) ?? [], [parsed]);
  const invalidRows = useMemo(() => parsed?.rows.filter((r) => !r.valid) ?? [], [parsed]);

  const handleFiles = useCallback((files: FileWithPath[]) => {
    setResults(null);
    setParsed(null);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) ?? '';
        const { headers, rows, headerError } = parseInviteRows(text);
        if (headerError) {
          notifications.show({ color: 'red', message: headerError });
          return;
        }
        setParsed({ headers, rows, fileName: file.name });
        notifications.show({ color: 'blue', message: `Parsed ${rows.length} rows from ${file.name}` });
      };
      reader.readAsText(file);
    }
  }, []);

  const handleInvite = useCallback(async () => {
    if (!parsed || validRows.length === 0) {
      return;
    }

    setRunning(true);
    setResults([]);
    setProgress(0);

    const projectId = medplum.getProject()?.id;
    const outcomes: InviteResult[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        const body = buildInviteBody(row, defaultAccessPolicy);
        const response = await medplum.invite(projectId as string, body);
        if (isOperationOutcome(response)) {
          outcomes.push({
            rowNumber: row.rowNumber,
            email: row.email,
            success: false,
            message: normalizeErrorString(response),
          });
        } else {
          outcomes.push({
            rowNumber: row.rowNumber,
            email: row.email,
            success: true,
            message: response.id ? `Created ${response.resourceType}/${response.id}` : 'Created',
          });
        }
      } catch (err) {
        outcomes.push({
          rowNumber: row.rowNumber,
          email: row.email,
          success: false,
          message: normalizeErrorString(err),
        });
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    medplum.invalidateSearches('Patient');
    medplum.invalidateSearches('Practitioner');
    medplum.invalidateSearches('ProjectMembership');

    const successCount = outcomes.filter((o) => o.success).length;
    notifications.show({
      color: successCount === outcomes.length ? 'green' : 'yellow',
      message: `Invited ${successCount} of ${outcomes.length} users`,
    });

    setResults(outcomes);
    setRunning(false);
  }, [medplum, parsed, validRows, defaultAccessPolicy]);

  return (
    <Document>
      <Title>Bulk Invite Users</Title>
      <Text c="dimmed" size="sm" mb="md">
        Upload a CSV to invite many users at once. Required columns:{' '}
        <Code>{REQUIRED_COLUMNS.join(', ')}</Code>. Optional columns:{' '}
        <Code>admin, sendEmail, accessPolicyId</Code>.
      </Text>

      <Stack gap="md">
        <AccessPolicyInput
          name="defaultAccessPolicy"
          onChange={(value) => setDefaultAccessPolicy(value)}
        />

        <Dropzone onDrop={handleFiles} accept={['text/csv']} maxFiles={1} disabled={running}>
          <Group justify="center" gap="xl" style={{ minHeight: 120, pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconCheck size={48} color="var(--mantine-color-green-6)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={48} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconUpload size={48} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>
            <Stack gap="xs" align="center">
              <Text size="xl" inline>
                Drag CSV here or click to select
              </Text>
              <Text size="sm" c="dimmed" inline>
                Only .csv files are accepted
              </Text>
            </Stack>
          </Group>
        </Dropzone>

        {parsed && (
          <>
            {invalidRows.length > 0 && (
              <Alert color="red" title={`${invalidRows.length} rows have errors`}>
                <List size="sm">
                  {invalidRows.map((row) => (
                    <List.Item key={row.rowNumber}>
                      Row {row.rowNumber} ({row.email || 'no email'}): {row.errors.join(', ')}
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}

            <Group justify="space-between" align="center">
              <Text>
                <strong>{parsed.fileName}</strong> — {validRows.length} valid, {invalidRows.length} invalid of{' '}
                {parsed.rows.length} rows
              </Text>
              <Button onClick={handleInvite} loading={running} disabled={validRows.length === 0}>
                Invite {validRows.length} user{validRows.length === 1 ? '' : 's'}
              </Button>
            </Group>

            {running && <Progress value={progress} animated />}

            <ScrollArea>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Row</Table.Th>
                    <Table.Th>First Name</Table.Th>
                    <Table.Th>Last Name</Table.Th>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Admin</Table.Th>
                    <Table.Th>Send Email</Table.Th>
                    <Table.Th>Access Policy</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parsed.rows.map((row) => {
                    const result = results?.find((r) => r.rowNumber === row.rowNumber);
                    return (
                      <Table.Tr key={row.rowNumber}>
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.firstName}</Table.Td>
                        <Table.Td>{row.lastName}</Table.Td>
                        <Table.Td>{row.email}</Table.Td>
                        <Table.Td>{row.role}</Table.Td>
                        <Table.Td>{row.admin ? 'Yes' : 'No'}</Table.Td>
                        <Table.Td>{row.sendEmail ? 'Yes' : 'No'}</Table.Td>
                        <Table.Td>{row.accessPolicyId ?? 'Default'}</Table.Td>
                        <Table.Td>{renderStatusCell(row, result)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}

        <Anchor
          href="https://www.medplum.com/docs/user-management"
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
        >
          Learn more about user management and access policies
        </Anchor>
      </Stack>
    </Document>
  );
}
