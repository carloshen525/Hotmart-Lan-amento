import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { phone, text, contactId, messageType, mediaUrl, mediaBase64, mediaMimeType, mediaFileName, caption } = await request.json();

    if (!phone || (!text && !mediaUrl && !mediaBase64)) {
      return NextResponse.json({ error: 'Telefone e mensagem ou mídia são obrigatórios' }, { status: 400 });
    }

    // Se não informou contactId, busca ou cria contato para rastreio
    let targetContactId = contactId;
    if (!targetContactId) {
      const cleanPhone = phone.replace(/\D/g, '');
      const existing = await prisma.contact.findFirst({
        where: { tenantId, phone: { contains: cleanPhone.slice(-8) } },
      });
      if (existing) {
        targetContactId = existing.id;
      } else {
        const newContact = await prisma.contact.create({
          data: {
            tenantId,
            name: `Contato ${cleanPhone.slice(-4)}`,
            email: `contato_${Date.now()}@temp.com`,
            phone,
            utmSource: 'whatsapp_manual',
            consentGiven: true,
          },
        });
        targetContactId = newContact.id;
      }
    }

    const result = await messageManager.sendWhatsApp({
      tenantId,
      contactId: targetContactId,
      phone,
      text,
      messageType,
      mediaUrl,
      mediaBase64,
      mediaMimeType,
      mediaFileName,
      caption,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
