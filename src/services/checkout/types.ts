export type CheckoutPlatformId =
  | 'HOTMART'
  | 'HOTMART_V2'
  | 'KIWIFY'
  | 'CAKTO'
  | 'MONETIZZE'
  | 'PERFECTPAY'
  | 'EDUZZ'
  | 'BRAIP'
  | 'BRAIP_STATUS_ENTREGUE'
  | 'ABMEX'
  | 'APPMAX'
  | 'ASAAS'
  | 'B4YOU'
  | 'DIGITAL_GURU'
  | 'DOPPUS'
  | 'DOPPUS_V3'
  | 'GREENN'
  | 'HEROSPARK'
  | 'KIRVANO'
  | 'LASTLINK'
  | 'MELLDIN'
  | 'PAGARME'
  | 'PAYT'
  | 'PAYT_CUSTOM'
  | 'PEPPER'
  | 'PROLUNO'
  | 'TICTO'
  | 'TICTO_V2'
  | 'VOOMP'
  | 'WORKCASH'
  | 'ASSINY'
  | 'ENSINIO_STATUS_ASSINATURA'
  | 'ENSINIO_STATUS_PEDIDO'
  | 'TMB_VENDAS'
  | 'ACTIVE_CAMPAIGN'
  | 'RD_STATION'
  | 'LEADSTER'
  | 'MANYCHAT'
  | 'SELLFLUX'
  | 'FACEBOOK'
  | 'HOTWEBINAR'
  | 'UNBOUNCE'
  | 'TRAZER_LEADS_CLINT'
  | 'MAGENTO'
  | 'SHOPIFY'
  | 'WOOCOMMERCE'
  | 'WOOCOMMERCE_NOVO'
  | 'WORDPRESS'
  | 'YAMPI'
  | 'YAMPI_CARRINHO_ABANDONADO'
  | 'IRROBA'
  | 'ISET'
  | 'ISET_CUSTOM'
  | 'VNDA'
  | 'WBUY'
  | 'WIX'
  | 'SACOLEIROAPP'
  | 'NOTAZZ'
  | 'ONPROFIT'
  | 'UOOUSOLUTIONS_LEAD'
  | 'UOOUSOLUTIONS_STATUS'
  | 'FORM_HTML'
  | 'FORM_MODAL'
  | 'FORM_MODAL_SIMPLE'
  | 'FORM_GAME'
  | 'FORM_CUSTOM'
  | 'FORMULARIO'
  | 'DADOS_DOS_LEADS'
  | 'TESTE_INTEGRADOR'
  | 'CUSTOM'
  | string;

export type StandardCheckoutEventType =
  | 'purchase_approved'
  | 'purchase_waiting_payment'
  | 'billet_printed'
  | 'pix_generated'
  | 'cart_abandoned'
  | 'canceled'
  | 'refunded'
  | 'chargeback'
  | 'lead_created'
  | 'unknown';

export interface StandardCustomer {
  name: string;
  email: string;
  phone?: string;
  document?: string;
}

export interface StandardProduct {
  id?: string;
  name: string;
}

export interface StandardPayment {
  type?: 'CREDIT_CARD' | 'PIX' | 'BILLET' | 'OTHER' | string;
  amount?: number;
  currency?: string;
  installments?: number;
  barcode?: string;
  pixQrCode?: string;
  pixCode?: string;
  billetUrl?: string;
}

export interface StandardCheckoutEvent {
  event: StandardCheckoutEventType;
  customer: StandardCustomer;
  product: StandardProduct;
  platform: CheckoutPlatformId;
  transactionId?: string;
  payment?: StandardPayment;
  orderId?: string;
  rawPayload: any;
  timestamp?: Date;
}

export interface CheckoutAdapter {
  readonly platform: CheckoutPlatformId;
  canHandle(payload: any, headers?: Record<string, string>): boolean;
  normalize(payload: any, headers?: Record<string, string>): StandardCheckoutEvent;
  verifySignature?(payload: any, headers: Record<string, string>, secretKey?: string): boolean;
}

export interface ProcessCheckoutWebhookResult {
  success: boolean;
  duplicate: boolean;
  ignored?: boolean;
  eventType: StandardCheckoutEventType;
  platform: CheckoutPlatformId;
  actionSummary: string;
  error?: string;
  contactId?: string;
  eventId?: string;
}

export type PlatformCategory = 'ALL' | 'PAYMENT' | 'MARKETING' | 'ECOMMERCE' | 'FORMS' | 'CUSTOM';

export interface PlatformPresetInfo {
  id: CheckoutPlatformId;
  name: string;
  category: PlatformCategory;
  description: string;
  badgeColor: string;
  iconName: string;
  iconBg?: string;
  iconLetter?: string;
  iconColor?: string;
  defaultDocUrl?: string;
  tokenLabel: string;
  tokenHint: string;
}

export const PLATFORM_PRESETS: PlatformPresetInfo[] = [
  // 1. Abmex
  {
    id: 'ABMEX',
    name: 'Abmex',
    category: 'PAYMENT',
    description: 'Plataforma de pagamentos para infoprodutos e produtos físicos.',
    badgeColor: 'from-orange-500 to-amber-600',
    iconName: 'DollarSign',
    iconBg: '#ff6600',
    iconLetter: 'X',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Abmex',
    tokenHint: 'Localizado nas configurações de Webhook da sua conta Abmex.',
  },
  // 2. Active Campaign
  {
    id: 'ACTIVE_CAMPAIGN',
    name: 'Active Campaign',
    category: 'MARKETING',
    description: 'Automação de e-mail marketing, funis e gestão de CRM.',
    badgeColor: 'from-blue-600 to-indigo-700',
    iconName: 'Send',
    iconBg: '#356ae6',
    iconLetter: '>',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de API / Webhook ActiveCampaign',
    tokenHint: 'Encontrada em Configurações > Desenvolvedor na sua conta ActiveCampaign.',
  },
  // 3. Appmax
  {
    id: 'APPMAX',
    name: 'Appmax',
    category: 'PAYMENT',
    description: 'Plataforma de processamento de pagamentos e checkout transparente.',
    badgeColor: 'from-cyan-500 to-blue-600',
    iconName: 'CreditCard',
    iconBg: '#00d2ff',
    iconLetter: 'A',
    iconColor: '#ffffff',
    tokenLabel: 'Token de API Appmax',
    tokenHint: 'Token de autenticação gerado nas integrações da Appmax.',
  },
  // 4. Asaas
  {
    id: 'ASAAS',
    name: 'Asaas',
    category: 'PAYMENT',
    description: 'Cobranças recorrentes, Pix instantâneo, boletos e gestão financeira.',
    badgeColor: 'from-sky-500 to-blue-700',
    iconName: 'DollarSign',
    iconBg: '#0030b8',
    iconLetter: 'A',
    iconColor: '#ffffff',
    tokenLabel: 'Access Token Asaas',
    tokenHint: 'Token de acesso gerado em Integrações > Webhooks no painel Asaas.',
  },
  // 5. B4you
  {
    id: 'B4YOU',
    name: 'B4you',
    category: 'PAYMENT',
    description: 'Plataforma de checkout e intermediação de vendas digitais.',
    badgeColor: 'from-emerald-500 to-teal-700',
    iconName: 'Zap',
    iconBg: '#059669',
    iconLetter: '4',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook B4you',
    tokenHint: 'Token gerado nas configurações de webhook da B4you.',
  },
  // 6. Braip
  {
    id: 'BRAIP',
    name: 'Braip',
    category: 'PAYMENT',
    description: 'Checkout avançado com alta aprovação para produtos digitais e físicos.',
    badgeColor: 'from-purple-600 to-indigo-700',
    iconName: 'PackageCheck',
    iconBg: '#7c3aed',
    iconLetter: '3',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Postback Braip',
    tokenHint: 'Token de autenticação gerado na aba Postback da Braip.',
  },
  // 7. Digital Guru
  {
    id: 'DIGITAL_GURU',
    name: 'Digital Guru',
    category: 'PAYMENT',
    description: 'Gestão de vendas, checkouts e automação para produtores e afiliados.',
    badgeColor: 'from-teal-500 to-cyan-600',
    iconName: 'ShoppingBag',
    iconBg: '#0d9488',
    iconLetter: 'G',
    iconColor: '#ffffff',
    tokenLabel: 'Token Digital Guru',
    tokenHint: 'Token de integração do Digital Guru.',
  },
  // 8. Doppus
  {
    id: 'DOPPUS',
    name: 'Doppus',
    category: 'PAYMENT',
    description: 'Plataforma completa de vendas digitais e afiliados.',
    badgeColor: 'from-amber-500 to-orange-600',
    iconName: 'CreditCard',
    iconBg: '#ea580c',
    iconLetter: 'D',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Doppus',
    tokenHint: 'Chave de webhook gerada no painel da Doppus.',
  },
  // 9. Doppus V3
  {
    id: 'DOPPUS_V3',
    name: 'Doppus V3',
    category: 'PAYMENT',
    description: 'Nova API de Webhooks v3 da Doppus com eventos granulares.',
    badgeColor: 'from-orange-600 to-red-600',
    iconName: 'Zap',
    iconBg: '#c2410c',
    iconLetter: 'D3',
    iconColor: '#ffffff',
    tokenLabel: 'Token Secreto Doppus V3',
    tokenHint: 'Token secreto da API v3 da Doppus.',
  },
  // 10. Eduzz
  {
    id: 'EDUZZ',
    name: 'Eduzz',
    category: 'PAYMENT',
    description: 'Ecossistema completo para produtores, afiliados e co-produtores.',
    badgeColor: 'from-amber-400 to-yellow-500',
    iconName: 'GraduationCap',
    iconBg: '#f59e0b',
    iconLetter: 'E',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Pública / Secreta Eduzz',
    tokenHint: 'Chave de validação disponível no menu Integrações da Eduzz.',
  },
  // 11. Facebook
  {
    id: 'FACEBOOK',
    name: 'Facebook',
    category: 'MARKETING',
    description: 'Captura automática de leads via Facebook e Instagram Lead Ads.',
    badgeColor: 'from-blue-500 to-blue-700',
    iconName: 'Globe',
    iconBg: '#1877f2',
    iconLetter: 'f',
    iconColor: '#ffffff',
    tokenLabel: 'Verify Token do Webhook do Facebook',
    tokenHint: 'Token configurado no painel de desenvolvedores do Facebook / Meta.',
  },
  // 12. Formulário de Game
  {
    id: 'FORM_GAME',
    name: 'Formulário de Game',
    category: 'FORMS',
    description: 'Formulário HTML para captura de leads.',
    badgeColor: 'from-yellow-500 to-amber-600',
    iconName: 'Code',
    iconBg: '#eab308',
    iconLetter: '📋',
    iconColor: '#ffffff',
    tokenLabel: 'Identificador do Formulário',
    tokenHint: 'Identificador único do formulário de gamificação.',
  },
  // 13. Formulário de Modal
  {
    id: 'FORM_MODAL',
    name: 'Formulário de Modal',
    category: 'FORMS',
    description: 'Formulário HTML para captura de leads.',
    badgeColor: 'from-yellow-500 to-amber-600',
    iconName: 'Code',
    iconBg: '#eab308',
    iconLetter: '📋',
    iconColor: '#ffffff',
    tokenLabel: 'Identificador do Formulário Modal',
    tokenHint: 'Identificador do formulário exibido em pop-up modal.',
  },
  // 14. Formulário de Modal SIMPLES
  {
    id: 'FORM_MODAL_SIMPLE',
    name: 'Formulário de Modal SIMPLES',
    category: 'FORMS',
    description: 'Formulário HTML para captura de leads.',
    badgeColor: 'from-yellow-500 to-amber-600',
    iconName: 'Code',
    iconBg: '#eab308',
    iconLetter: '📋',
    iconColor: '#ffffff',
    tokenLabel: 'Identificador do Formulário Simples',
    tokenHint: 'Identificador do formulário modal simplificado (nome e WhatsApp).',
  },
  // 15. Greenn
  {
    id: 'GREENN',
    name: 'Greenn',
    category: 'PAYMENT',
    description: 'Plataforma para checkout e venda de produtos físicos e digitais.',
    badgeColor: 'from-emerald-500 to-green-600',
    iconName: 'ShoppingBag',
    iconBg: '#10b981',
    iconLetter: 'G',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Greenn',
    tokenHint: 'Chave secreta obtida em Configurações > Webhooks na Greenn.',
  },
  // 16. Herospark
  {
    id: 'HEROSPARK',
    name: 'Herospark',
    category: 'PAYMENT',
    description: 'Plataforma tudo-em-um para infoprodutores e criadores de conteúdo.',
    badgeColor: 'from-rose-500 to-pink-600',
    iconName: 'Flame',
    iconBg: '#e11d48',
    iconLetter: 'H',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Integração HeroSpark',
    tokenHint: 'Token de webhook gerado no painel HeroSpark.',
  },
  // 17. Hotmart
  {
    id: 'HOTMART',
    name: 'Hotmart',
    category: 'PAYMENT',
    description: 'Maior plataforma de infoprodutos da América Latina com suporte a Webhooks 2.0 e Hottok.',
    badgeColor: 'from-orange-500 to-red-600',
    iconName: 'Flame',
    iconBg: '#f97316',
    iconLetter: '🔥',
    iconColor: '#ffffff',
    tokenLabel: 'Hottok (Token Secreto da Hotmart)',
    tokenHint: 'Localizado em Ferramentas > Webhook (API) na sua conta Hotmart.',
  },
  // 18. Hotmart V2
  {
    id: 'HOTMART_V2',
    name: 'Hotmart V2',
    category: 'PAYMENT',
    description: 'Integração oficial versão 2.0 com suporte completo a eventos e assinaturas.',
    badgeColor: 'from-red-500 to-orange-600',
    iconName: 'Flame',
    iconBg: '#ea580c',
    iconLetter: '🔥',
    iconColor: '#ffffff',
    tokenLabel: 'Hottok V2',
    tokenHint: 'Token Hottok da Hotmart para verificação da versão 2.0.0.',
  },
  // 19. Hotwebinar
  {
    id: 'HOTWEBINAR',
    name: 'Hotwebinar',
    category: 'MARKETING',
    description: 'Transmissão ao vivo de webinars e captura automática de participantes.',
    badgeColor: 'from-red-600 to-rose-700',
    iconName: 'Video',
    iconBg: '#dc2626',
    iconLetter: 'H',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Webhook Hotwebinar',
    tokenHint: 'Chave de validação fornecida pelo Hotwebinar.',
  },
  // 20. Irroba
  {
    id: 'IRROBA',
    name: 'Irroba',
    category: 'ECOMMERCE',
    description: 'Plataforma robusta de e-commerce e lojas virtuais de alto tráfego.',
    badgeColor: 'from-red-500 to-rose-600',
    iconName: 'ShoppingBag',
    iconBg: '#b91c1c',
    iconLetter: 'i',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Notificação Irroba',
    tokenHint: 'Token de webhook configurado no painel Irroba.',
  },
  // 21. Iset
  {
    id: 'ISET',
    name: 'Iset',
    category: 'ECOMMERCE',
    description: 'Plataforma brasileira de comércio eletrônico e lojas online.',
    badgeColor: 'from-sky-600 to-blue-700',
    iconName: 'ShoppingBag',
    iconBg: '#0284c7',
    iconLetter: 'i',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Integração Iset',
    tokenHint: 'Chave de autenticação da Iset.',
  },
  // 22. Iset Custom
  {
    id: 'ISET_CUSTOM',
    name: 'Iset Custom',
    category: 'ECOMMERCE',
    description: 'Conector customizado com mapeamento avançado para Iset.',
    badgeColor: 'from-blue-700 to-indigo-800',
    iconName: 'Code',
    iconBg: '#1d4ed8',
    iconLetter: 'i',
    iconColor: '#ffffff',
    tokenLabel: 'Token Personalizado Iset',
    tokenHint: 'Chave de assinatura ou cabeçalho de segurança da Iset.',
  },
  // 23. Kirvano
  {
    id: 'KIRVANO',
    name: 'Kirvano',
    category: 'PAYMENT',
    description: 'Plataforma para checkout e venda de produtos digitais com taxas competitivas.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'DollarSign',
    iconBg: '#0f172a',
    iconLetter: 'K',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Kirvano',
    tokenHint: 'Token de webhook encontrado nas configurações da Kirvano.',
  },
  // 24. Kiwify
  {
    id: 'KIWIFY',
    name: 'Kiwify',
    category: 'PAYMENT',
    description: 'Checkout de alta conversão para produtos digitais e mentorias.',
    badgeColor: 'from-emerald-500 to-teal-600',
    iconName: 'Zap',
    iconBg: '#10b981',
    iconLetter: '🥝',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Verificação Kiwify',
    tokenHint: 'Token de autenticação gerado nas configurações de Webhooks da Kiwify.',
  },
  // 25. Lastlink
  {
    id: 'LASTLINK',
    name: 'Lastlink',
    category: 'PAYMENT',
    description: 'Monetização de grupos, comunidades e assinaturas no WhatsApp e Telegram.',
    badgeColor: 'from-green-600 to-emerald-700',
    iconName: 'Users',
    iconBg: '#059669',
    iconLetter: 'L',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Lastlink',
    tokenHint: 'Chave secreta obtida nas integrações da Lastlink.',
  },
  // 26. Leadster
  {
    id: 'LEADSTER',
    name: 'Leadster',
    category: 'MARKETING',
    description: 'Chatbot conversacional de captura e qualificação de leads no site.',
    badgeColor: 'from-cyan-500 to-blue-600',
    iconName: 'MessageSquare',
    iconBg: '#0ea5e9',
    iconLetter: '✳️',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Leadster',
    tokenHint: 'Chave de integração gerada na Leadster.',
  },
  // 27. Magento
  {
    id: 'MAGENTO',
    name: 'Magento',
    category: 'ECOMMERCE',
    description: 'E-commerce corporativo e lojas virtuais Adobe Commerce / Magento.',
    badgeColor: 'from-orange-600 to-amber-700',
    iconName: 'ShoppingBag',
    iconBg: '#ea580c',
    iconLetter: 'M',
    iconColor: '#ffffff',
    tokenLabel: 'API Key / Token Magento',
    tokenHint: 'Token de autenticação gerado nas integrações REST do Magento.',
  },
  // 28. Manychat
  {
    id: 'MANYCHAT',
    name: 'Manychat',
    category: 'MARKETING',
    description: 'Automação de chat inteligente no WhatsApp, Instagram e Facebook Messenger.',
    badgeColor: 'from-slate-800 to-black',
    iconName: 'MessageSquare',
    iconBg: '#000000',
    iconLetter: 'M',
    iconColor: '#ffffff',
    tokenLabel: 'Bearer Token / Chave Manychat',
    tokenHint: 'Token de autenticação configurado na automação do Manychat.',
  },
  // 29. Melldin
  {
    id: 'MELLDIN',
    name: 'Melldin',
    category: 'PAYMENT',
    description: 'Gateway de pagamentos e checkout transparente para vendas online.',
    badgeColor: 'from-pink-600 to-rose-700',
    iconName: 'CreditCard',
    iconBg: '#db2777',
    iconLetter: 'M',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Webhook Melldin',
    tokenHint: 'Token gerado nas configurações da Melldin.',
  },
  // 30. Monetizze
  {
    id: 'MONETIZZE',
    name: 'Monetizze',
    category: 'PAYMENT',
    description: 'Plataforma líder para infoprodutos e produtos físicos no Brasil.',
    badgeColor: 'from-blue-600 to-indigo-600',
    iconName: 'DollarSign',
    iconBg: '#2563eb',
    iconLetter: 'M',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Única / Chave da API Monetizze',
    tokenHint: 'Encontrada em Ferramentas > Postback na sua conta Monetizze.',
  },
  // 31. Notazz
  {
    id: 'NOTAZZ',
    name: 'Notazz',
    category: 'ECOMMERCE',
    description: 'Emissão automática de notas fiscais de serviço e produto para vendas.',
    badgeColor: 'from-teal-600 to-cyan-700',
    iconName: 'FileText',
    iconBg: '#0f766e',
    iconLetter: 'N',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de API Notazz',
    tokenHint: 'Chave obtida nas configurações de API do Notazz.',
  },
  // 32. OnProfit
  {
    id: 'ONPROFIT',
    name: 'OnProfit',
    category: 'ECOMMERCE',
    description: 'Plataforma de inteligência, rastreamento de campanhas e métricas de lucro.',
    badgeColor: 'from-emerald-600 to-teal-700',
    iconName: 'Zap',
    iconBg: '#059669',
    iconLetter: 'P',
    iconColor: '#ffffff',
    tokenLabel: 'Token OnProfit',
    tokenHint: 'Chave de webhook do OnProfit.',
  },
  // 33. Pagarme
  {
    id: 'PAGARME',
    name: 'Pagarme',
    category: 'PAYMENT',
    description: 'Infraestrutura robusta de pagamentos digitais Stone e Pagar.me.',
    badgeColor: 'from-green-600 to-emerald-700',
    iconName: 'CreditCard',
    iconBg: '#15803d',
    iconLetter: 'P',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Secreta Pagar.me (API Key)',
    tokenHint: 'Chave secreta gerada no painel Pagar.me / Stone.',
  },
  // 34. Payt
  {
    id: 'PAYT',
    name: 'Payt',
    category: 'PAYMENT',
    description: 'Plataforma de checkout transparente de alta performance e conversão.',
    badgeColor: 'from-orange-500 to-amber-600',
    iconName: 'DollarSign',
    iconBg: '#f97316',
    iconLetter: 'Payt',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Postback Payt',
    tokenHint: 'Token configurado na aba de integrações da Payt.',
  },
  // 35. Payt Custom
  {
    id: 'PAYT_CUSTOM',
    name: 'Payt Custom',
    category: 'PAYMENT',
    description: 'Configuração customizada para webhooks da plataforma Payt.',
    badgeColor: 'from-amber-600 to-orange-700',
    iconName: 'Code',
    iconBg: '#d97706',
    iconLetter: 'Payt',
    iconColor: '#ffffff',
    tokenLabel: 'Token Customizado Payt',
    tokenHint: 'Chave secreta da Payt.',
  },
  // 36. Pepper
  {
    id: 'PEPPER',
    name: 'Pepper',
    category: 'PAYMENT',
    description: 'Checkout e processamento de vendas digitais para produtores.',
    badgeColor: 'from-red-600 to-rose-700',
    iconName: 'Flame',
    iconBg: '#dc2626',
    iconLetter: '🌶️',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Pepper',
    tokenHint: 'Chave de autenticação gerada na Pepper.',
  },
  // 37. Perfect Pay
  {
    id: 'PERFECTPAY',
    name: 'Perfect Pay',
    category: 'PAYMENT',
    description: 'Gateway especializado em vendas digitais, upsell com 1 clique e recuperação.',
    badgeColor: 'from-teal-600 to-emerald-700',
    iconName: 'CreditCard',
    iconBg: '#0d9488',
    iconLetter: 'P',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Postback PerfectPay',
    tokenHint: 'Token configurado na aba Webhooks / Postback da PerfectPay.',
  },
  // 38. Proluno
  {
    id: 'PROLUNO',
    name: 'Proluno',
    category: 'PAYMENT',
    description: 'Plataforma de ensino, cursos online e monetização para educadores.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'GraduationCap',
    iconBg: '#1e293b',
    iconLetter: 'P',
    iconColor: '#ffffff',
    tokenLabel: 'Token Proluno',
    tokenHint: 'Token de integração do Proluno.',
  },
  // 39. RD Station Marketing
  {
    id: 'RD_STATION',
    name: 'RD Station Marketing',
    category: 'MARKETING',
    description: 'Plataforma líder em automação de marketing, captura e nutrição de leads.',
    badgeColor: 'from-cyan-600 to-blue-700',
    iconName: 'Send',
    iconBg: '#0891b2',
    iconLetter: 'RD',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook RD Station',
    tokenHint: 'Chave de webhook gerada em Integrações no RD Station.',
  },
  // 40. Sacoleiroapp
  {
    id: 'SACOLEIROAPP',
    name: 'Sacoleiroapp',
    category: 'ECOMMERCE',
    description: 'Catálogo virtual e automação de vendas para revendedores e lojistas.',
    badgeColor: 'from-red-500 to-pink-600',
    iconName: 'ShoppingBag',
    iconBg: '#ef4444',
    iconLetter: 'S',
    iconColor: '#ffffff',
    tokenLabel: 'Token Sacoleiroapp',
    tokenHint: 'Chave de integração da Sacoleiroapp.',
  },
  // 41. SellFlux
  {
    id: 'SELLFLUX',
    name: 'SellFlux',
    category: 'MARKETING',
    description: 'Plataforma de automação de funis de vendas e recuperação por mensagens.',
    badgeColor: 'from-blue-700 to-indigo-900',
    iconName: 'Zap',
    iconBg: '#1e3a8a',
    iconLetter: 'SFX',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Integração SellFlux',
    tokenHint: 'Token de webhook configurado no SellFlux.',
  },
  // 42. Shopify
  {
    id: 'SHOPIFY',
    name: 'Shopify',
    category: 'ECOMMERCE',
    description: 'Plataforma global líder em lojas virtuais, checkout e pedidos.',
    badgeColor: 'from-emerald-600 to-green-700',
    iconName: 'ShoppingBag',
    iconBg: '#16a34a',
    iconLetter: 'S',
    iconColor: '#ffffff',
    tokenLabel: 'Segredo Compartilhado do Webhook Shopify (HMAC)',
    tokenHint: 'Chave secreta exibida nas configurações de Webhooks do Shopify.',
  },
  // 43. Ticto
  {
    id: 'TICTO',
    name: 'Ticto',
    category: 'PAYMENT',
    description: 'Plataforma de alta escala para vendas de produtos físicos e digitais.',
    badgeColor: 'from-purple-600 to-pink-700',
    iconName: 'ShoppingBag',
    iconBg: '#9333ea',
    iconLetter: 'T',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Ticto',
    tokenHint: 'Token de postback gerado nas configurações da Ticto.',
  },
  // 44. Ticto V2
  {
    id: 'TICTO_V2',
    name: 'Ticto V2',
    category: 'PAYMENT',
    description: 'Versão 2.0 da API de Webhooks da Ticto com suporte a tracking granular.',
    badgeColor: 'from-pink-600 to-purple-700',
    iconName: 'Zap',
    iconBg: '#a855f7',
    iconLetter: 'T2',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Secreta Ticto V2',
    tokenHint: 'Chave de assinatura da API v2 da Ticto.',
  },
  // 45. Unbounce
  {
    id: 'UNBOUNCE',
    name: 'Unbounce',
    category: 'MARKETING',
    description: 'Criação de landing pages inteligentes e formulários de alta conversão.',
    badgeColor: 'from-blue-500 to-cyan-600',
    iconName: 'Globe',
    iconBg: '#0284c7',
    iconLetter: 'U',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Webhook Unbounce',
    tokenHint: 'URL de webhook configurada na landing page do Unbounce.',
  },
  // 46. Vnda
  {
    id: 'VNDA',
    name: 'Vnda',
    category: 'ECOMMERCE',
    description: 'Plataforma de e-commerce Olist Vnda para marcas de moda e varejo.',
    badgeColor: 'from-blue-600 to-indigo-700',
    iconName: 'ShoppingBag',
    iconBg: '#2563eb',
    iconLetter: 'V',
    iconColor: '#ffffff',
    tokenLabel: 'Token Vnda',
    tokenHint: 'Chave de autenticação gerada no painel Vnda.',
  },
  // 47. Voomp
  {
    id: 'VOOMP',
    name: 'Voomp',
    category: 'PAYMENT',
    description: 'Checkout rápido e transparente para infoprodutos e cursos.',
    badgeColor: 'from-orange-600 to-amber-600',
    iconName: 'CreditCard',
    iconBg: '#d97706',
    iconLetter: 'V',
    iconColor: '#ffffff',
    tokenLabel: 'Token Voomp',
    tokenHint: 'Token de integração do Voomp.',
  },
  // 48. wBuy
  {
    id: 'WBUY',
    name: 'wBuy',
    category: 'ECOMMERCE',
    description: 'Plataforma completa para lojas virtuais e vendas no atacado e varejo.',
    badgeColor: 'from-red-600 to-rose-700',
    iconName: 'ShoppingBag',
    iconBg: '#dc2626',
    iconLetter: 'W',
    iconColor: '#ffffff',
    tokenLabel: 'Token wBuy',
    tokenHint: 'Token de webhook configurado no painel wBuy.',
  },
  // 49. Wix
  {
    id: 'WIX',
    name: 'Wix',
    category: 'ECOMMERCE',
    description: 'Formulários e lojas virtuais construídas na plataforma Wix.',
    badgeColor: 'from-amber-400 to-yellow-600',
    iconName: 'Globe',
    iconBg: '#d97706',
    iconLetter: 'Wix',
    iconColor: '#ffffff',
    tokenLabel: 'Chave de Autenticação Wix',
    tokenHint: 'Token gerado no Wix Automations / Webhooks.',
  },
  // 50. Woocommerce
  {
    id: 'WOOCOMMERCE',
    name: 'Woocommerce',
    category: 'ECOMMERCE',
    description: 'Maior plugin de comércio eletrônico para sites em WordPress.',
    badgeColor: 'from-purple-600 to-indigo-700',
    iconName: 'ShoppingBag',
    iconBg: '#7c3aed',
    iconLetter: 'Woo',
    iconColor: '#ffffff',
    tokenLabel: 'Segredo do Webhook WooCommerce (Secret)',
    tokenHint: 'Chave configurada em WooCommerce > Configurações > Avançado > Webhooks.',
  },
  // 51. Wordpress
  {
    id: 'WORDPRESS',
    name: 'Wordpress',
    category: 'ECOMMERCE',
    description: 'Formulários Elementor, Contact Form 7, WPForms e formulários WordPress.',
    badgeColor: 'from-sky-600 to-blue-800',
    iconName: 'Globe',
    iconBg: '#0284c7',
    iconLetter: 'WP',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Secreta do Webhook WordPress',
    tokenHint: 'Chave configurada na Ação Após o Envio do Elementor ou plugin.',
  },
  // 52. Workcash
  {
    id: 'WORKCASH',
    name: 'Workcash',
    category: 'PAYMENT',
    description: 'Gateway de intermediação financeira e automação de pagamentos.',
    badgeColor: 'from-purple-700 to-indigo-800',
    iconName: 'CreditCard',
    iconBg: '#6d28d9',
    iconLetter: 'W',
    iconColor: '#ffffff',
    tokenLabel: 'Token Workcash',
    tokenHint: 'Token de autenticação Workcash.',
  },
  // 53. Yampi
  {
    id: 'YAMPI',
    name: 'Yampi',
    category: 'ECOMMERCE',
    description: 'Checkout transparente de alta conversão e plataforma de loja virtual.',
    badgeColor: 'from-pink-500 to-rose-600',
    iconName: 'ShoppingBag',
    iconBg: '#ec4899',
    iconLetter: 'Y',
    iconColor: '#ffffff',
    tokenLabel: 'Token Secreto do Webhook Yampi',
    tokenHint: 'Secret Key configurada nos Webhooks da Yampi.',
  },
  // 54. Custom
  {
    id: 'CUSTOM',
    name: 'Custom',
    category: 'CUSTOM',
    description: 'Mapeie os dados dos leads via JSON.',
    badgeColor: 'from-blue-600 to-indigo-700',
    iconName: 'Code',
    iconBg: '#2563eb',
    iconLetter: '🌐',
    iconColor: '#ffffff',
    tokenLabel: 'Chave Secreta Opcional (Bearer / Header)',
    tokenHint: 'Utilizada para validar o cabeçalho Authorization ou x-secret-token.',
  },
  // 55. Dados dos Leads
  {
    id: 'DADOS_DOS_LEADS',
    name: 'Dados dos Leads',
    category: 'CUSTOM',
    description: 'Acesso para plataformas externas obterem dados dos seus leads.',
    badgeColor: 'from-sky-500 to-blue-600',
    iconName: 'Users',
    iconBg: '#0284c7',
    iconLetter: '👥',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Acesso da API de Leads',
    tokenHint: 'Token utilizado por terceiros para autenticar requisições no endpoint POST /api/leads.',
  },
  // 56. Formulário
  {
    id: 'FORMULARIO',
    name: 'Formulário',
    category: 'FORMS',
    description: 'Formulário HTML para captura de leads.',
    badgeColor: 'from-yellow-500 to-amber-600',
    iconName: 'Code',
    iconBg: '#eab308',
    iconLetter: '📋',
    iconColor: '#ffffff',
    tokenLabel: 'Identificador do Formulário',
    tokenHint: 'Código gerado automaticamente para o formulário HTML embeddable.',
  },
  // 57. Assiny
  {
    id: 'ASSINY',
    name: 'Assiny',
    category: 'PAYMENT',
    description: 'Gestão completa de assinaturas, recorrência e membros.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'CreditCard',
    iconBg: '#334155',
    iconLetter: 'A',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Webhook Assiny',
    tokenHint: 'Token gerado no painel da Assiny.',
  },
  // 58. Braip - Status Entregue
  {
    id: 'BRAIP_STATUS_ENTREGUE',
    name: 'Braip - Status Entregue',
    category: 'PAYMENT',
    description: 'Webhook específico para rastreio e entrega física de produtos Braip.',
    badgeColor: 'from-purple-700 to-indigo-800',
    iconName: 'PackageCheck',
    iconBg: '#6d28d9',
    iconLetter: '📦',
    iconColor: '#ffffff',
    tokenLabel: 'Token Braip Postback',
    tokenHint: 'Token configurado na Braip para evento de entrega.',
  },
  // 59. Ensinio Status Assinatura
  {
    id: 'ENSINIO_STATUS_ASSINATURA',
    name: 'Ensinio Status Assinatura',
    category: 'PAYMENT',
    description: 'Status de assinaturas e matrículas na plataforma Ensinio.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'GraduationCap',
    iconBg: '#334155',
    iconLetter: 'E',
    iconColor: '#ffffff',
    tokenLabel: 'Token Ensinio',
    tokenHint: 'Token de webhook configurado no Ensinio.',
  },
  // 60. Ensinio Status Pedido
  {
    id: 'ENSINIO_STATUS_PEDIDO',
    name: 'Ensinio Status Pedido',
    category: 'PAYMENT',
    description: 'Status de pedidos, compras e pagamentos na plataforma Ensinio.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'GraduationCap',
    iconBg: '#334155',
    iconLetter: 'E',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Pedidos Ensinio',
    tokenHint: 'Chave de webhook para pedidos Ensinio.',
  },
  // 61. Teste INTEGRADOR
  {
    id: 'TESTE_INTEGRADOR',
    name: 'Teste INTEGRADOR',
    category: 'CUSTOM',
    description: 'Ambiente sandbox para testes e simulação de qualquer webhook.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'Code',
    iconBg: '#1e293b',
    iconLetter: '🧪',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Testes (Opcional)',
    tokenHint: 'Token utilizado para testar autenticações.',
  },
  // 62. TMB - Vendas/Checkout
  {
    id: 'TMB_VENDAS',
    name: 'TMB - Vendas/Checkout',
    category: 'PAYMENT',
    description: 'Checkout transparente e vendas integradas TMB Educação.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'ShoppingBag',
    iconBg: '#334155',
    iconLetter: 'TMB',
    iconColor: '#ffffff',
    tokenLabel: 'Token TMB',
    tokenHint: 'Chave de integração TMB.',
  },
  // 63. Trazer leads Clint
  {
    id: 'TRAZER_LEADS_CLINT',
    name: 'Trazer leads Clint',
    category: 'MARKETING',
    description: 'Importação e sincronização de leads da plataforma Clint CRM.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'Users',
    iconBg: '#334155',
    iconLetter: 'C',
    iconColor: '#ffffff',
    tokenLabel: 'Token Clint',
    tokenHint: 'Token de integração do Clint.',
  },
  // 64. UoouSolutions Lead
  {
    id: 'UOOUSOLUTIONS_LEAD',
    name: 'UoouSolutions Lead',
    category: 'ECOMMERCE',
    description: 'Captura de novos leads e cadastros da plataforma UoouSolutions.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'Users',
    iconBg: '#334155',
    iconLetter: 'U',
    iconColor: '#ffffff',
    tokenLabel: 'Token UoouSolutions',
    tokenHint: 'Chave de webhook UoouSolutions.',
  },
  // 65. UoouSolutions Status
  {
    id: 'UOOUSOLUTIONS_STATUS',
    name: 'UoouSolutions Status',
    category: 'ECOMMERCE',
    description: 'Atualizações de status de pedidos e transações UoouSolutions.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'ShoppingBag',
    iconBg: '#334155',
    iconLetter: 'U',
    iconColor: '#ffffff',
    tokenLabel: 'Token de Status UoouSolutions',
    tokenHint: 'Chave de webhook para status UoouSolutions.',
  },
  // 66. Woocommerce Novo
  {
    id: 'WOOCOMMERCE_NOVO',
    name: 'Woocommerce Novo',
    category: 'ECOMMERCE',
    description: 'Nova API REST v3 do WooCommerce com webhooks aprimorados.',
    badgeColor: 'from-purple-700 to-indigo-800',
    iconName: 'ShoppingBag',
    iconBg: '#6d28d9',
    iconLetter: 'Woo',
    iconColor: '#ffffff',
    tokenLabel: 'Segredo do Webhook (Secret)',
    tokenHint: 'Chave secreta configurada no WooCommerce v3.',
  },
  // 67. Yampi - Carrinho abandonado
  {
    id: 'YAMPI_CARRINHO_ABANDONADO',
    name: 'Yampi - Carrinho abandonado',
    category: 'ECOMMERCE',
    description: 'Recuperação automática de carrinho abandonado da Yampi.',
    badgeColor: 'from-pink-600 to-rose-700',
    iconName: 'ShoppingBag',
    iconBg: '#db2777',
    iconLetter: 'Y',
    iconColor: '#ffffff',
    tokenLabel: 'Token Yampi Carrinho',
    tokenHint: 'Chave secreta configurada na Yampi para o evento de carrinho abandonado.',
  },
];
