import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// GET - Download/serve attachment file
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Get attachment details
    const { data: attachment, error } = await supabase
      .from('grievance_attachments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    
    // Check if file exists
    const filePath = join(process.cwd(), attachment.file_path);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on server' }, { status: 404 });
    }
    
    // Read file
    const fileBuffer = await readFile(filePath);
    
    // Return file with appropriate headers
    const response = new NextResponse(fileBuffer);
    response.headers.set('Content-Type', attachment.mime_type);
    response.headers.set('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    response.headers.set('Content-Length', attachment.file_size.toString());
    
    return response;
    
  } catch (error) {
    console.error('Error serving attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 