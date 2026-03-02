import { useEkkoaCoverageAreas, type EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";

/**
 * Normaliza CEP removendo caracteres não numéricos
 */
function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, "");
}

/**
 * Valida formato de CEP brasileiro (8 dígitos)
 */
export function isValidBrazilianCep(cep: string): boolean {
  return /^\d{8}$/.test(normalizeCep(cep));
}

/**
 * Verifica se um CEP está dentro de uma faixa de cobertura
 */
function isCepInRange(cep: string, area: EkkoaCoverageArea): boolean {
  const normalized = normalizeCep(cep);

  // Verifica por faixa de CEP
  if (area.zip_code_start) {
    const start = normalizeCep(area.zip_code_start);
    const end = area.zip_code_end ? normalizeCep(area.zip_code_end) : start;
    if (normalized >= start && normalized <= end) return true;
  }

  return false;
}

/**
 * Verifica se uma cidade/estado corresponde a uma área de cobertura
 */
function isCityMatch(city: string | null, state: string | null, area: EkkoaCoverageArea): boolean {
  if (!city && !state) return false;
  const cityMatch = city && area.city && city.toLowerCase().trim() === area.city.toLowerCase().trim();
  const stateMatch = state && area.state && state.toLowerCase().trim() === area.state.toLowerCase().trim();
  
  if (area.city && area.state) return !!(cityMatch && stateMatch);
  if (area.city) return !!cityMatch;
  if (area.state) return !!stateMatch;
  return false;
}

export interface CoverageValidationResult {
  isValid: boolean;
  matchedArea: EkkoaCoverageArea | null;
  message: string;
}

/**
 * Valida se um endereço está em uma área de cobertura
 */
export function validateCoverage(
  zipCode: string | null,
  city: string | null,
  state: string | null,
  areas: EkkoaCoverageArea[]
): CoverageValidationResult {
  const activeAreas = areas.filter((a) => a.is_active);

  if (activeAreas.length === 0) {
    return { isValid: true, matchedArea: null, message: "Nenhuma área de cobertura configurada." };
  }

  // Tenta validar por CEP primeiro
  if (zipCode) {
    const normalized = normalizeCep(zipCode);
    if (normalized.length > 0 && !isValidBrazilianCep(zipCode)) {
      return { isValid: false, matchedArea: null, message: "CEP inválido. Use o formato 00000-000 (8 dígitos)." };
    }

    if (isValidBrazilianCep(zipCode)) {
      const matched = activeAreas.find((a) => isCepInRange(zipCode, a));
      if (matched) {
        return { isValid: true, matchedArea: matched, message: `Área de cobertura: ${matched.name}` };
      }
    }
  }

  // Tenta validar por cidade/estado
  if (city || state) {
    const matched = activeAreas.find((a) => isCityMatch(city, state, a));
    if (matched) {
      return { isValid: true, matchedArea: matched, message: `Área de cobertura: ${matched.name}` };
    }
  }

  // Nenhuma correspondência encontrada
  if (zipCode || city || state) {
    return { isValid: false, matchedArea: null, message: "Endereço fora da área de cobertura cadastrada." };
  }

  return { isValid: false, matchedArea: null, message: "Informe CEP ou cidade/estado para validar a cobertura." };
}

/**
 * Hook que expõe a validação de cobertura com dados carregados
 */
export function useCoverageValidation() {
  const { data: areas = [], isLoading } = useEkkoaCoverageAreas();

  const validate = (zipCode: string | null, city: string | null, state: string | null) =>
    validateCoverage(zipCode, city, state, areas);

  return { validate, isLoading, hasAreas: areas.filter((a) => a.is_active).length > 0 };
}
