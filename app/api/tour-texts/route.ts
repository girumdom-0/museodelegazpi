import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tour_texts')
    .select('action_name, title, text');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'no-store' },
  });
}
