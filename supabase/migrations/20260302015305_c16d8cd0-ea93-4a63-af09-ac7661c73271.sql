-- Add assigned_user_id column to clients for commercial user filtering
ALTER TABLE public.clients ADD COLUMN assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Set existing clients' assigned_user_id to their created_by (initial migration)
UPDATE public.clients SET assigned_user_id = created_by WHERE assigned_user_id IS NULL;

-- Create index for performance
CREATE INDEX idx_clients_assigned_user_id ON public.clients(assigned_user_id);

-- Add assigned_to column to proposals for department/user filtering
ALTER TABLE public.proposals ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Set existing proposals' assigned_to to their created_by
UPDATE public.proposals SET assigned_to = created_by WHERE assigned_to IS NULL;

CREATE INDEX idx_proposals_assigned_to ON public.proposals(assigned_to);