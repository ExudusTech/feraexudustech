-- Add instalacao_agendada to operation_status enum
ALTER TYPE public.operation_status ADD VALUE IF NOT EXISTS 'instalacao_agendada';

-- Add schedule_type to schedules for differentiating consultant vs operational schedules
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'geral';

-- Create storage bucket for visit photos
INSERT INTO storage.buckets (id, name, public) VALUES ('visit-photos', 'visit-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload
CREATE POLICY "Users can upload visit photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'visit-photos');

-- Storage policy: anyone can view (public bucket)
CREATE POLICY "Public read visit photos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'visit-photos');