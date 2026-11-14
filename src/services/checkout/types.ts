export type CheckoutPlatformId =
  | 'HOTMART'
  | 'KIWIFY'
  | 'CAKTO'
  | 'MONETIZZE'
  | 'PERFECTPAY'
  | 'EDUZZ'
  | 'BRAIP'
  | 'CUSTOM';

export type StandardCheckoutEventType =
  | 'purchase_approved'
  | 'purchase_waiting_payment'
  | 'billet_printed'
  | 'pix_generated'
  | 'cart_abandoned'
  | 'canceled'
  | 'refunded'
  | 'chargeback'
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

export interface PlatformPresetInfo {
  id: CheckoutPlatformId;
  name: string;
  description: string;
  badgeColor: string;
  iconName: string;
  defaultDocUrl: string;
  tokenLabel: string;
  tokenHint: string;
}

export const PLATFORM_PRESETS: PlatformPresetInfo[] = [
  {
    id: 'HOTMART',
    name: 'Hotmart',
    description: 'Maior plataforma de infoprodutos da América Latina com suporte a Webhooks 2.0 e Hottok.',
    badgeColor: 'from-orange-500 to-amber-600',
    iconName: 'Flame',
    defaultDocUrl: 'https://help.hotmart.com/pt-BR/article/como-configurar-o-webhook-api-na-hotmart/360044033311',
    tokenLabel: 'Hottok (Token Secreto da Hotmart)',
    tokenHint: 'Localizado em Ferramentas > Webhook (API) na sua conta Hotmart.',
  },
  {
    id: 'KIWIFY',
    name: 'Kiwify',
    description: 'Checkout de alta conversão para produtos digitais e mentorias.',
    badgeColor: 'from-emerald-500 to-teal-600',
    iconName: 'Zap',
    defaultDocUrl: 'https://ajuda.kiwify.com.br/pt-br/article/como-configurar-webhooks-na-kiwify-1941v1t/',
    tokenLabel: 'Token de Verificação Kiwify',
    tokenHint: 'Token de autenticação gerado nas configurações de Webhooks da Kiwify.',
  },
  {
    id: 'CAKTO',
    name: 'Cakto',
    description: 'Plataforma moderna de checkout transparente e automação de pagamentos.',
    badgeColor: 'from-pink-500 to-rose-600',
    iconName: 'ShoppingBag',
    defaultDocUrl: 'https://ajuda.cakto.com.br/',
    tokenLabel: 'Chave Secreta Cakto (Secret Key)',
    tokenHint: 'Chave de assinatura fornecida pela Cakto para autenticar requisições.',
  },
  {
    id: 'MONETIZZE',
    name: 'Monetizze',
    description: 'Plataforma líder para infoprodutos e produtos físicos no Brasil.',
    badgeColor: 'from-blue-600 to-indigo-600',
    iconName: 'DollarSign',
    defaultDocUrl: 'https://ajuda.monetizze.com.br/hc/pt-br/articles/360039773232-Como-configurar-o-Postback-Webhook',
    tokenLabel: 'Chave Única / Chave da API Monetizze',
    tokenHint: 'Encontrada em Ferramentas > Postback na sua conta Monetizze.',
  },
  {
    id: 'PERFECTPAY',
    name: 'PerfectPay',
    description: 'Gateway especializado em vendas digitais, upsell com 1 clique e recuperação.',
    badgeColor: 'from-violet-600 to-purple-600',
    iconName: 'CreditCard',
    defaultDocUrl: 'https://suporte.perfectpay.com.br/',
    tokenLabel: 'Token de Postback PerfectPay',
    tokenHint: 'Token configurado na aba Webhooks / Postback da PerfectPay.',
  },
  {
    id: 'EDUZZ',
    name: 'Eduzz',
    description: 'Ecossistema completo para produtores, afiliados e co-produtores.',
    badgeColor: 'from-amber-500 to-yellow-600',
    iconName: 'GraduationCap',
    defaultDocUrl: 'https://ajuda.eduzz.com/hc/pt-br/articles/360029329492-Como-configurar-o-Postback-Webhook-na-Eduzz',
    tokenLabel: 'Chave Pública / Secreta Eduzz',
    tokenHint: 'Chave de validação disponível no menu Integrações da Eduzz.',
  },
  {
    id: 'BRAIP',
    name: 'Braip',
    description: 'Checkout avançado com alta aprovação para produtos digitais e físicos.',
    badgeColor: 'from-cyan-600 to-blue-700',
    iconName: 'PackageCheck',
    defaultDocUrl: 'https://suporte.braip.com/',
    tokenLabel: 'Chave de Postback Braip',
    tokenHint: 'Token de autenticação gerado na aba Postback da Braip.',
  },
  {
    id: 'CUSTOM',
    name: 'Webhook Personalizado',
    description: 'Conecte qualquer sistema externo, landing page, Typeform ou CRM proprietário.',
    badgeColor: 'from-slate-700 to-slate-900',
    iconName: 'Code',
    defaultDocUrl: '',
    tokenLabel: 'Chave Secreta Opcional (Bearer / Header)',
    tokenHint: 'Utilizada para validar o cabeçalho Authorization ou x-secret-token.',
  },
];
