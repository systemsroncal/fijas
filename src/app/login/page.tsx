'use client';

import { Suspense } from 'react';
import LoginForm from './LoginForm';

/**
 * Login con Suspense por useSearchParams.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
