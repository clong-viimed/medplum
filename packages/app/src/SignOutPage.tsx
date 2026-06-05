// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react';
import { useEffect } from 'react';

export function SignOutPage(): null {
  const medplum = useMedplum();

  useEffect(() => {
    medplum
      .signOut()
      .catch(console.error)
      .finally(() => {
        window.location.href = '/signin';
      });
  }, [medplum]);

  return null;
}