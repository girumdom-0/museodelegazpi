import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase-config';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }) },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith('/admin') && !user) return NextResponse.redirect(new URL('/login', request.url));
  if (request.nextUrl.pathname === '/login' && user) return NextResponse.redirect(new URL('/admin', request.url));
  return response;
}

export const config = { matcher: ['/admin/:path*', '/login'] };