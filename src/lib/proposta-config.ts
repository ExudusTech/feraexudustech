// Mirror of supabase/functions/_shared/proposta-pdf.ts defaults (test-enforced) for the Settings screen.
export interface PropostaConfig {
  slogan: string; experiencia: string;
  txt_empresa: string; txt_parcerias: string; txt_tecnologia: string; txt_consultoria: string; faixa: string;
  validade_dias: number; forma_pagamento: string; prazo_entrega: string; periodicidade_manutencao: string;
  whatsapp: string; site: string; instagram: string;
}

export const DEFAULT_PROPOSTA_CONFIG: PropostaConfig = {
  slogan: "Inovação, este é o nosso papel!",
  experiencia: "Mais de 20 anos de experiência em higienização profissional",
  txt_empresa: "A Nit's Clean oferece soluções logísticas eficientes e produtos de limpeza de alta qualidade. São mais de 20 anos no mercado, com parcerias sólidas com os líderes do setor e filial em Búzios atendendo toda a Região dos Lagos.",
  txt_parcerias: "Trabalhamos com marcas líderes de mercado, garantindo qualidade, desempenho e reposição confiável.",
  txt_tecnologia: "Sistemas e equipamentos que aumentam a eficiência, reduzem o desperdício e otimizam o consumo de produtos.",
  txt_consultoria: "Consultores dedicados acompanham sua operação de perto, de forma presencial ou virtual.",
  faixa: "Logística ágil, atendimento personalizado e entrega em até 24 horas.",
  validade_dias: 10, forma_pagamento: "Boleto bancário, 28 dias", prazo_entrega: "Até 24 horas após o aceite",
  periodicidade_manutencao: "Mensal",
  whatsapp: "(22) 99266-8769", site: "www.nitsclean.com.br", instagram: "@nitsclean",
};

