import { EmailOptions, EmailResult, VerifyResult } from './types';

export interface EmailProvider {
  /**
   * Envia um e-mail através do provedor configurado
   */
  send(options: EmailOptions): Promise<EmailResult>;

  /**
   * Valida as credenciais e conectividade com o servidor do provedor
   */
  verify(): Promise<VerifyResult>;
}
