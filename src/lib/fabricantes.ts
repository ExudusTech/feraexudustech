/** Common manufacturers of loaned equipment; the field stays free text so new brands can be typed. */
export const FABRICANTES_SUGERIDOS = ["Kimberly-Clark", "Suzano", "Diversey", "Ekkoa", "Tork", "Ecolab"];
export const TIPOS_OS = { instalacao: "Instalação", teste: "Teste", manutencao: "Manutenção", retirada: "Retirada" } as const;
export type TipoOS = keyof typeof TIPOS_OS;
