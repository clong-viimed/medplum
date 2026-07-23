// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen, waitFor } from '../test-utils/render';

const medplum = new MockClient();

function createFile(content: string, name: string, type = 'text/csv'): File {
  return new File([content], name, { type });
}

function getFileInput(): HTMLInputElement {
  const input = screen.getByRole('presentation').querySelector('input[type="file"]');
  if (!input) {
    throw new Error('Could not find file input');
  }
  return input as HTMLInputElement;
}

describe('BulkInvitePage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setup(url: string): ReturnType<typeof renderAppRoutes> {
    return renderAppRoutes(medplum, url);
  }

  test('Renders', async () => {
    setup('/admin/bulk-invite');
    expect(await screen.findByText('Bulk Invite Users')).toBeInTheDocument();
  });

  test('Parses valid CSV and invites users', async () => {
    const inviteSpy = jest.spyOn(medplum, 'invite').mockResolvedValue({
      resourceType: 'ProjectMembership',
      id: 'membership-1',
    } as ProjectMembership);
    jest.spyOn(medplum, 'getProject').mockReturnValue({ resourceType: 'Project', id: '123', name: 'Demo' });

    setup('/admin/bulk-invite');
    expect(await screen.findByText('Bulk Invite Users')).toBeInTheDocument();

    const csv = 'firstName,lastName,email,role,admin,sendEmail\nGeorge,Washington,george@example.com,Practitioner,true,true';
    await act(async () => {
      fireEvent.change(getFileInput(), { target: { files: [createFile(csv, 'users.csv')] } });
    });

    await waitFor(() => expect(screen.getByText(/1 valid, 0 invalid/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Invite 1 user'));
    });

    await waitFor(() => expect(inviteSpy).toHaveBeenCalledTimes(1));
    expect(inviteSpy).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        resourceType: 'Practitioner',
        firstName: 'George',
        lastName: 'Washington',
        email: 'george@example.com',
        admin: true,
        sendEmail: true,
      })
    );
  });

  test('Reports missing required columns', async () => {
    setup('/admin/bulk-invite');
    expect(await screen.findByText('Bulk Invite Users')).toBeInTheDocument();

    const csv = 'firstName,lastName,email\nGeorge,Washington,george@example.com';
    await act(async () => {
      fireEvent.change(getFileInput(), { target: { files: [createFile(csv, 'users.csv')] } });
    });

    await waitFor(() => expect(screen.getByText(/Missing required columns: role/)).toBeInTheDocument());
  });

  test('Reports invalid rows', async () => {
    setup('/admin/bulk-invite');
    expect(await screen.findByText('Bulk Invite Users')).toBeInTheDocument();

    const csv = 'firstName,lastName,email,role\n,Washington,bad-email,Unknown';
    await act(async () => {
      fireEvent.change(getFileInput(), { target: { files: [createFile(csv, 'users.csv')] } });
    });

    await waitFor(() => expect(screen.getByText(/1 rows have errors/)).toBeInTheDocument());
    expect(screen.getAllByText(/firstName is required/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/email is invalid/).length).toBeGreaterThan(0);
  });
});
