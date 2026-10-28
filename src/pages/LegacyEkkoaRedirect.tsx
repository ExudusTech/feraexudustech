import { Navigate, useSearchParams } from "react-router-dom";
import { legacyEkkoaTarget } from "@/lib/permissions";

/** The old "Ekkoa" menu was split into the general screens; old links land on the new one. */
export default function LegacyEkkoaRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={legacyEkkoaTarget(params.get("tab"))} replace />;
}
