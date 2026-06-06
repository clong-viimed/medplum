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