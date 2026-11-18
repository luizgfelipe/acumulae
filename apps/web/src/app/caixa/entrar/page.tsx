'use client';

import { Suspense } from 'react';
import { StaffLogin } from '@/components/staff-login';

export default function Page() {
  return (
    <Suspense>
      <StaffLogin area="caixa" />
    </Suspense>
  );
}
