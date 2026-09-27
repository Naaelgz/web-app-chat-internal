'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/theme-toggle';
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
} from '../../lib/chat-data';

const darkLogo = '/logo/Akselera%20Tech%20dark%20logo.png';
const whiteLogo = '/logo/Akselera%20Tech%20white%20logo.png';

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' }).then((response) => {
      if (response.ok && !cancelled) router.replace('/chat');
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(isRegistering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? (isRegistering ? 'Registrasi gagal.' : 'Login gagal.'));
        return;
      }

      router.push('/chat');
    } catch {
      setError('Server tidak dapat dihubungi. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRegistration = () => {
    setIsRegistering((current) => !current);
    setError('');
  };

  return (
    <main className="page-shell auth-shell-simple">
      <header className="login-topbar">
        <Image
          src={theme === 'light' ? darkLogo : whiteLogo}
          alt="Akselera Tech logo"
          className="brand-logo header-logo"
          width={190}
          height={52}
          priority
        />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <div className="login-card">
        <h1>{isRegistering ? 'Buat akun' : 'Masuk'}</h1>

        <form className="auth-form-simple" onSubmit={handleLogin}>
          {isRegistering ? (
            <label>
              Nama
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama lengkap"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="andi@contoh.id"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegistering ? 'Minimal 8 karakter' : 'Password'}
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              minLength={isRegistering ? 8 : undefined}
              maxLength={256}
              required
            />
          </label>

          {error ? <p className="error-message">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : isRegistering ? 'Daftar' : 'Masuk'}
          </button>
        </form>
        <p className="auth-mode-switch">
          {isRegistering ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
          <button className="auth-mode-button" type="button" onClick={toggleRegistration}>
            {isRegistering ? 'Masuk' : 'Daftar'}
          </button>
        </p>
      </div>
    </main>
  );
}
