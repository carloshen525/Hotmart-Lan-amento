import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    const pathParts = params.path || [];
    // Previne Directory Traversal
    const safePath = pathParts.join('/').replace(/\.\./g, '');
    const diskPath = path.join(process.cwd(), 'public', 'uploads', safePath);

    if (!fs.existsSync(diskPath)) {
      return new NextResponse('Arquivo não encontrado', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(diskPath);
    const ext = path.extname(diskPath).toLowerCase().replace('.', '');

    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      pdf: 'application/pdf',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse('Erro interno ao servir arquivo', { status: 500 });
  }
}
