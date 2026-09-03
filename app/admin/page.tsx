import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { isSupabaseConfigured } from '@/lib/supabase-config';
import Dashboard from './dashboard';

export default async function AdminPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <Dashboard email={user.email ?? ''} />;
}

function SetupNotice() {
  return <main className="login"><section className="login-card" aria-labelledby="setup-title"><p className="eyebrow">Museo de Legazpi</p><h1 id="setup-title">Connect Supabase.</h1><p>Add valid Supabase project settings to <strong>.env.local</strong>, then restart the development server.</p><div className="alert" role="alert">Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</div></section></main>;
}