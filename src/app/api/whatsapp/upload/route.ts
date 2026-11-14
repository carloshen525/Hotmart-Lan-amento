import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const originalName = file.name || 'arquivo';
    const mimeType = file.type || 'application/octet-stream';
    const fileSize = file.size;

    // Identifica o tipo de mídia
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (mimeType.startsWith('image/')) {
      mediaType = 'image';
    } else if (mimeType.startsWith('video/')) {
      mediaType = 'video';
    } else if (mimeType.startsWith('audio/') || originalName.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      mediaType = 'audio';
    }

    // Cria diretório de uploads se não existir
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'whatsapp');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Gera nome de arquivo único e sanitizado
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}_${sanitizedName}`;
    const filePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/whatsapp/${fileName}`;
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({
      success: true,
      url: relativeUrl,
      dataUrl,
      fileName: originalName,
      fileSize,
      mimeType,
      mediaType,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro no upload' }, { status: 500 });
  }
}
