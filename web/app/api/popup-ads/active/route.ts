import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('pop_up_ads')
      .select('*')
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    return NextResponse.json({ success: true, data: data?.[0] || null });
  } catch (error) {
    console.error('Error fetching active pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch active pop-up ad' },
      { status: 500 }
    );
  }
}