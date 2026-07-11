import { redirect } from 'next/navigation';

/** Redirige la raíz al dashboard. */
export default function HomePage() {
  redirect('/dashboard');
}
