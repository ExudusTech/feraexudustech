import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildClientInsert } from "@/hooks/use-clients";

const u = { id: "marcos", organization_id: "org1" };
const base = { name: "Clínica Pró Vida", status: "active" } as any;

describe("client creation", () => {
  it("assigns the creator when no consultant is chosen", () => {
    expect(buildClientInsert(base, u).assigned_user_id).toBe("marcos");
  });
  it("keeps an explicitly chosen consultant", () => {
    expect(buildClientInsert({ ...base, assigned_user_id: "other" }, u).assigned_user_id).toBe("other");
  });
  it("stamps creator and organization", () => {
    const r = buildClientInsert(base, u);
    expect(r.created_by).toBe("marcos");
    expect(r.organization_id).toBe("org1");
  });
});
