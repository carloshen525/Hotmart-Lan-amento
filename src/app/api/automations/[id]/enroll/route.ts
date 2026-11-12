import { NextResponse } from 'next/server';
import { automationEngine } from '@/services/automation/engine';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { contactId } = await request.json();
    if (!contactId) {
      return NextResponse.json({ error: 'contactId é obrigatório' }, { status: 400 });
    }

    const result = await automationEngine.enrollContact(params.id, contactId, { source: 'MANUAL_ENTRY' });
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
