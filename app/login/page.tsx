'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { isSupabaseConfigured } from '@/lib/supabase-config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!isSupabaseConfigured()) { setError('Supabase is not configured. Add the values from your project API settings to .env.local and restart Next.js.'); return; }
    setLoading(true);
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
    if (signInError) { setError('We could not sign you in. Check your details and try again.'); setLoading(false); return; }
    window.location.href = '/admin';
  }
  return <main className="login"><section className="login-card" aria-labelledby="login-title">
    <p className="eyebrow">Museo de Legazpi</p><h1 id="login-title">Welcome back.</h1><p>Sign in to manage the museum&apos;s artifact text.</p>
    {error && <div className="alert" role="alert">{error}</div>}
    <form onSubmit={submit}><div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
    <button className="button" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button></form>
  </section></main>;
}