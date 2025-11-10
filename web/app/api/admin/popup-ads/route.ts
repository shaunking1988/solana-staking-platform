import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET all pop-up ads (admin)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('pop_up_ads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching pop-up ads:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pop-up ads' },
      { status: 500 }
    );
  }
}

// POST create new pop-up ad
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { data, error } = await supabase
      .from('pop_up_ads')
      .insert({
        title: body.title,
        description: body.description,
        image_url: body.image_url,
        cta_text: body.cta_text,
        cta_link: body.cta_link,
        is_active: body.is_active ?? true,
        start_date: body.start_date,
        end_date: body.end_date,
        display_frequency: body.display_frequency ?? 'once_per_session',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create pop-up ad' },
      { status: 500 }
    );
  }
}