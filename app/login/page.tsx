'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/theme-toggle';
import { getTheme, setTheme } from '../../lib/chat-data';

const darkLogo = '/logo/Akselera Tech dark logo.png';
const whiteLogo = '/logo/Akselera Tech white logo.png';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' }).then((response) => {
      if (response.ok && !cancelled) router.replace('/chat');
    });

    const currentTheme = getTheme();
    setThemeState(currentTheme);
    document.documentElement.dataset.theme = currentTheme;

    return () => {
      cancelled = true;
    };
  }, [router]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(nextTheme);
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? 'Login gagal.');
        return;
      }

      router.push('/chat');
    } catch {
      setError('Server tidak dapat dihubungi. Coba lagi.');
    }
  };

  return (
    <main className="page-shell auth-shell-simple">
      <header className="login-topbar">
        <Image
          src={theme === 'light' ? darkLogo : whiteLogo}
          alt="Akselera Tech logo"
          className="brand-logo header-logo"
          width={150}
          height={32}
          priority
        />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <div className="login-card">
        <h1>Masuk</h1>

        <form className="auth-form-simple" onSubmit={handleLogin}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="andi@contoh.id"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="•••••••"
            />
          </label>

          {error ? <p className="error-message">{error}</p> : null}

          <button className="primary-button" type="submit">
            Masuk
          </button>
        </form>
      </div>
    </main>
  );
}
