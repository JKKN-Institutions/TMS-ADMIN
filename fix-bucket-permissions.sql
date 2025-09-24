-- Fix bug-screenshots bucket permissions and policies

-- First, ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bug-screenshots', 'bug-screenshots', true, 10485760, 
        ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
ON CONFLICT (id) 
DO UPDATE SET 
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

-- Remove any restrictive RLS policies
DROP POLICY IF EXISTS "Anyone can view bug screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload bug screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Bug screenshot upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Bug screenshot access policy" ON storage.objects;

-- Create permissive policies for bug-screenshots bucket
CREATE POLICY "Anyone can view bug screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'bug-screenshots');

CREATE POLICY "Anyone can upload bug screenshots" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bug-screenshots');

CREATE POLICY "Anyone can update bug screenshots" ON storage.objects
  FOR UPDATE USING (bucket_id = 'bug-screenshots');

CREATE POLICY "Anyone can delete bug screenshots" ON storage.objects
  FOR DELETE USING (bucket_id = 'bug-screenshots');

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated, anon, service_role;
GRANT ALL ON storage.buckets TO authenticated, anon, service_role;

-- Ensure bucket is truly public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'bug-screenshots';

