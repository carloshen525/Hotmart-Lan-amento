export interface HotmartWebhookPayload {
  id?: string;
  event?: string;
  hottok?: string;
  creation_date?: number;
  data?: {
    buyer?: {
      email?: string;
      name?: string;
      checkout_phone?: string;
    };
    product?: {
      id?: number | string;
      name?: string;
    };
    purchase?: {
      transaction?: string;
      status?: string;
      order_date?: number;
      approved_date?: number;
      price?: {
        value?: number;
        currency_code?: string;
      };
      payment?: {
        type?: string; // PIX, BILLET, CREDIT_CARD, etc.
        installments_number?: number;
      };
      offer?: {
        code?: string;
      };
    };
  };
}

export interface WebhookProcessResult {
  success: boolean;
  duplicate: boolean;
  eventType: string;
  contactId?: string;
  actionSummary: string;
  error?: string;
}
