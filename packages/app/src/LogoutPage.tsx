// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loading, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export function LogoutPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  useEffect(() => {
    medplum
      .signOut()
      .then(() => {
        navigate('/signin')?.catch(console.error);
      })
      .catch((err) => {
        console.error('Sign out error:', err);
        navigate('/signin')?.catch(console.error);
      });
  }, [medplum, navigate]);

  return <Loading />;
}
