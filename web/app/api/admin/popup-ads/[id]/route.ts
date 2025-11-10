import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT update pop-up ad
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    const { data, error } = await supabase
      .from('pop_up_ads')
      .update({
        title: body.title,
        description: body.description,
        image_url: body.image_url,
        cta_text: body.cta_text,
        cta_link: body.cta_link,
        is_active: body.is_active,
        start_date: body.start_date,
        end_date: body.end_date,
        display_frequency: body.display_frequency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update pop-up ad' },
      { status: 500 }
    );
  }
}

// DELETE pop-up ad
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabase
      .from('pop_up_ads')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete pop-up ad' },
      { status: 500 }
    );
  }
}