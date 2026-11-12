import { prisma } from '@/lib/prisma';
import { IMessageService, SendEmailParams, SendWhatsAppParams, SendResult } from './types';

export class SimulatedMessageService implements IMessageService {
  async sendWhatsApp(params: SendWhatsAppParams): Promise<SendResult> {
    const formattedText = params.text || `Olá! Modelo: ${params.templateName || 'aviso_padrao'}`;
    const costEstimate = 0.05; // Custo médio de mensagem de utilidade Meta em dólares

    const log = await prisma.messageLog.create({
      data: {
        tenantId: params.tenantId,
        contactId: params.contactId,
        channel: 'WHATSAPP',
        provider: 'SIMULATED',
        recipient: params.phone,
        templateName: params.templateName,
        content: formattedText,
        status: 'DELIVERED',
        costEstimate,
        externalMessageId: `sim_wpp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        deliveredAt: new Date(),
        readAt: new Date(Date.now() + 15000), // Simula leitura após 15s
      },
    });

    return {
      success: true,
      messageId: log.id,
      provider: 'SIMULATED',
      status: 'DELIVERED',
      costEstimate,
    };
  }

  async sendEmail(params: SendEmailParams): Promise<SendResult> {
    const costEstimate = 0.001; // Custo Resend / SES por envio

    const log = await prisma.messageLog.create({
      data: {
        tenantId: params.tenantId,
        contactId: params.contactId,
        channel: 'EMAIL',
        provider: 'SIMULATED',
        recipient: params.email,
        subject: params.subject,
        content: params.content,
        status: 'DELIVERED',
        costEstimate,
        externalMessageId: `sim_email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        deliveredAt: new Date(),
      },
    });

    return {
      success: true,
      messageId: log.id,
      provider: 'SIMULATED',
      status: 'DELIVERED',
      costEstimate,
    };
  }
}
