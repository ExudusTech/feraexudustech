import { useState, useEffect } from "react";
import { fetchViaCep, type ViaCepResult } from "@/lib/scheduling-utils";

/**
 * Hook that fetches address data from ViaCEP when a valid CEP is provided
 */
export function useViaCep(cep: string) {
  const [data, setData] = useState<ViaCepResult | null>(null);
  const [loading, setLoading] = useState(false);

  const normalized = cep.replace(/\D/g, "");

  useEffect(() => {
    if (normalized.length !== 8) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchViaCep(cep).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [normalized]);

  return { data, loading };
}
