import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, priority, grievanceId } = body;

    if (!category) {
      return NextResponse.json(
        { success: false, error: 'Category is required' },
        { status: 400 }
      );
    }

    // Use the enhanced function from the SQL schema
    const { data: recommendations, error } = await supabaseAdmin
      .rpc('get_recommended_admin_for_grievance', {
        p_grievance_id: grievanceId || null,
        p_category: category,
        p_priority: priority || 'medium'
      });

    if (error) {
      throw error;
    }

    // Format the recommendations
    const formattedRecommendations = recommendations.map((rec: any) => ({
      admin_id: rec.admin_id,
      admin_name: rec.admin_name,
      match_score: rec.match_score,
      recommendation_reason: rec.recommendation_reason
    }));

    return NextResponse.json({
      success: true,
      data: formattedRecommendations,
      meta: {
        category,
        priority,
        total_recommendations: formattedRecommendations.length
      }
    });

  } catch (error) {
    console.error('Error getting staff recommendations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get staff recommendations',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 