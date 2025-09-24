-- Bug Report Storage Setup
-- This script sets up storage buckets and policies for bug report attachments

-- Create storage bucket for bug attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-attachments',
  'bug-attachments',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'text/plain',
    'application/pdf'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for bug attachments

-- Allow authenticated users to upload files
CREATE POLICY "Users can upload bug attachments" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'bug-attachments' AND
    auth.role() = 'authenticated'
  );

-- Allow users to view attachments for bugs they can access
CREATE POLICY "Users can view bug attachments" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'bug-attachments' AND
    EXISTS (
      SELECT 1 FROM bug_reports br
      JOIN bug_attachments ba ON br.id = ba.bug_report_id
      WHERE ba.file_path = name AND
      (
        -- Reporter can see their own bug attachments
        (br.reporter_type = 'student' AND br.reporter_id::text = auth.jwt() ->> 'sub') OR
        -- Admins can see all bug attachments
        EXISTS (
          SELECT 1 FROM admin_users au
          WHERE au.id::text = auth.jwt() ->> 'sub' AND au.is_active = true
        )
      )
    )
  );

-- Allow users to delete their own attachments (within first hour)
CREATE POLICY "Users can delete recent bug attachments" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'bug-attachments' AND
    EXISTS (
      SELECT 1 FROM bug_reports br
      JOIN bug_attachments ba ON br.id = ba.bug_report_id
      WHERE ba.file_path = name AND
      ba.uploaded_by_id::text = auth.jwt() ->> 'sub' AND
      ba.uploaded_at > NOW() - INTERVAL '1 hour'
    )
  );

-- Allow admins to delete any bug attachments
CREATE POLICY "Admins can delete bug attachments" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'bug-attachments' AND
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id::text = auth.jwt() ->> 'sub' AND au.is_active = true
    )
  );

-- Create function to get signed URLs for bug attachments
CREATE OR REPLACE FUNCTION get_bug_attachment_url(file_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  signed_url TEXT;
BEGIN
  -- Check if user has access to this attachment
  IF NOT EXISTS (
    SELECT 1 FROM bug_reports br
    JOIN bug_attachments ba ON br.id = ba.bug_report_id
    WHERE ba.file_path = file_path AND
    (
      -- Reporter can see their own bug attachments
      (br.reporter_type = 'student' AND br.reporter_id::text = auth.jwt() ->> 'sub') OR
      -- Admins can see all bug attachments
      EXISTS (
        SELECT 1 FROM admin_users au
        WHERE au.id::text = auth.jwt() ->> 'sub' AND au.is_active = true
      )
    )
  ) THEN
    RETURN NULL;
  END IF;

  -- Generate signed URL (valid for 1 hour)
  SELECT storage.get_signed_url('bug-attachments', file_path, 3600) INTO signed_url;
  
  RETURN signed_url;
END;
$$;

-- Create function to clean up orphaned attachments
CREATE OR REPLACE FUNCTION cleanup_orphaned_bug_attachments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
  attachment_record RECORD;
BEGIN
  -- Find bug attachments that don't have corresponding bug reports
  FOR attachment_record IN
    SELECT ba.file_path
    FROM bug_attachments ba
    LEFT JOIN bug_reports br ON ba.bug_report_id = br.id
    WHERE br.id IS NULL
  LOOP
    -- Delete from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'bug-attachments' AND name = attachment_record.file_path;
    
    -- Delete from bug_attachments table
    DELETE FROM bug_attachments WHERE file_path = attachment_record.file_path;
    
    deleted_count := deleted_count + 1;
  END LOOP;
  
  RETURN deleted_count;
END;
$$;

-- Create function to get bug attachment statistics
CREATE OR REPLACE FUNCTION get_bug_attachment_stats()
RETURNS TABLE (
  total_attachments BIGINT,
  total_size_mb NUMERIC,
  image_count BIGINT,
  document_count BIGINT,
  avg_file_size_kb NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_attachments,
    ROUND(SUM(file_size::NUMERIC) / (1024 * 1024), 2) as total_size_mb,
    COUNT(*) FILTER (WHERE file_type LIKE 'image/%') as image_count,
    COUNT(*) FILTER (WHERE file_type NOT LIKE 'image/%') as document_count,
    ROUND(AVG(file_size::NUMERIC) / 1024, 2) as avg_file_size_kb
  FROM bug_attachments;
END;
$$;

-- Schedule cleanup of orphaned attachments (run daily)
-- This would typically be set up as a cron job or scheduled function
-- For demonstration, we'll create the function that can be called manually

COMMENT ON FUNCTION cleanup_orphaned_bug_attachments() IS 'Cleans up storage files for deleted bug reports';
COMMENT ON FUNCTION get_bug_attachment_url(TEXT) IS 'Gets a signed URL for a bug attachment file';
COMMENT ON FUNCTION get_bug_attachment_stats() IS 'Returns statistics about bug attachments storage usage';

