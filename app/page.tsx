'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then((response) => {
      router.replace(response.ok ? '/chat' : '/login');
    });
  }, [router]);

  return (
    <main className="page-shell centered-screen">
      <div className="loading-card">
        <div className="spinner" aria-hidden="true" />
        <p>Memuat aplikasi chat...</p>
      </div>
    </main>
  );
}
