import { supabase } from "@/integrations/supabase/client";

/** Asks the backend to alert the team about a newly created visit; never blocks or fails the booking. */
export function notifySchedule(kind: "schedule" | "maintenance", id: string): void {
  supabase.functions.invoke("notify-schedule", { body: { kind, id } }).catch(() => undefined);
}
