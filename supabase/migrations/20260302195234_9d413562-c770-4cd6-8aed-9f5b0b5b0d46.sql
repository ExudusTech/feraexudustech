
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS installation_date date,
  ADD COLUMN IF NOT EXISTS last_maintenance_date date,
  ADD COLUMN IF NOT EXISTS geolocation text,
  ADD COLUMN IF NOT EXISTS photo_url text;
