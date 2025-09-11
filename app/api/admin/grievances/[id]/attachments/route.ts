import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// GET - Get all attachments for a grievance
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    const { data, error } = await supabase
      .from('grievance_attachments')
      .select('*')
      .eq('grievance_id', id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching attachments:', error);
      return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in GET /api/admin/grievances/[id]/attachments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Upload new attachment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const formData = await request.formData();
    
    const file = formData.get('file') as File;
    const uploadedBy = formData.get('uploaded_by') as string;
    const uploadedByType = formData.get('uploaded_by_type') as string;
    const uploadPurpose = formData.get('upload_purpose') as string;
    const isPublic = formData.get('is_public') === 'true';
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Validate file type and size
    const allowedTypes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4',
      'video/quicktime'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size too large (max 10MB)' }, { status: 400 });
    }
    
    // Verify grievance exists
    const { data: grievance, error: grievanceError } = await supabase
      .from('grievances')
      .select('id')
      .eq('id', id)
      .single();
    
    if (grievanceError || !grievance) {
      return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    
    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'uploads', 'grievances', id);
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }
    
    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, buffer);
    
    // Save attachment record to database
    const { data: attachment, error: insertError } = await supabase
      .from('grievance_attachments')
      .insert({
        grievance_id: id,
        file_name: file.name,
        file_path: `uploads/grievances/${id}/${fileName}`,
        file_size: file.size,
        file_type: file.type.split('/')[0], // image, video, document, etc.
        mime_type: file.type,
        uploaded_by: uploadedBy,
        uploaded_by_type: uploadedByType,
        upload_purpose: uploadPurpose || 'evidence',
        is_public: isPublic
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error saving attachment record:', insertError);
      return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 });
    }
    
    return NextResponse.json(attachment, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST /api/admin/grievances/[id]/attachments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete attachment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachment_id');
    
    if (!attachmentId) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 });
    }
    
    // Get attachment details
    const { data: attachment, error: fetchError } = await supabase
      .from('grievance_attachments')
      .select('*')
      .eq('id', attachmentId)
      .eq('grievance_id', id)
      .single();
    
    if (fetchError || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    
    // Delete file from filesystem
    try {
      const fs = require('fs');
      const fullPath = join(process.cwd(), attachment.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (fileError) {
      console.error('Error deleting file:', fileError);
      // Continue with database deletion even if file deletion fails
    }
    
    // Delete record from database
    const { error: deleteError } = await supabase
      .from('grievance_attachments')
      .delete()
      .eq('id', attachmentId);
    
    if (deleteError) {
      console.error('Error deleting attachment record:', deleteError);
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
    }
    
    return NextResponse.json({ message: 'Attachment deleted successfully' });
    
  } catch (error) {
    console.error('Error in DELETE /api/admin/grievances/[id]/attachments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 