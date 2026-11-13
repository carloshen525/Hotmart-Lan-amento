import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { automationEngine } from '@/services/automation/engine';

// Utilitário para quebrar linha CSV respeitando aspas
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Utilitário para limpar e formatar telefone internacional
function formatPhone(ddd?: string, tel?: string, country?: string): string | null {
  const rawDdd = (ddd || '').replace(/\D/g, '');
  let rawTel = (tel || '').replace(/\D/g, '');

  if (!rawTel && !rawDdd) return null;

  // Se já tiver DDI e DDD completo (ex: 5561999021848)
  if (rawTel.startsWith('55') && rawTel.length >= 12) {
    return `+${rawTel}`;
  }

  // Se veio DDD e telefone separados (padrão Hotmart: DDD="61", Telefone="999021848")
  if (rawDdd && rawTel) {
    // Garante que o telefone tenha 8 ou 9 dígitos
    return `+55${rawDdd}${rawTel}`;
  }

  // Se veio apenas telefone de 10 ou 11 dígitos no Brasil
  if (rawTel.length === 10 || rawTel.length === 11) {
    return `+55${rawTel}`;
  }

  if (rawTel.length >= 8) {
    return `+55${rawTel}`;
  }

  return rawTel ? `+${rawTel}` : null;
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    let csvContent = '';
    let additionalTags: string[] = [];
    let tagByProduct = true;
    let tagByStatus = true;
    let triggerAutomation = false;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
      }
      csvContent = await file.text();

      const tagsParam = formData.get('tags') as string | null;
      if (tagsParam) {
        try {
          additionalTags = JSON.parse(tagsParam);
        } catch {
          additionalTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
        }
      }

      tagByProduct = formData.get('tagByProduct') !== 'false';
      tagByStatus = formData.get('tagByStatus') !== 'false';
      triggerAutomation = formData.get('triggerAutomation') === 'true';
    } else {
      const body = await request.json();
      csvContent = body.csvContent || '';
      additionalTags = body.tags || [];
      tagByProduct = body.tagByProduct !== false;
      tagByStatus = body.tagByStatus !== false;
      triggerAutomation = !!body.triggerAutomation;
    }

    if (!csvContent || !csvContent.trim()) {
      return NextResponse.json({ error: 'Conteúdo do CSV está vazio' }, { status: 400 });
    }

    // Remove BOM (Byte Order Mark comum no Excel/Hotmart)
    const cleanCSV = csvContent.replace(/^\uFEFF/, '').trim();
    const lines = cleanCSV.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return NextResponse.json({ error: 'O CSV deve conter pelo menos cabeçalho e uma linha de dados' }, { status: 400 });
    }

    // Detecta delimitador: Hotmart usa ';' por padrão; outros usam ','
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const rawHeaders = parseCSVLine(lines[0], delimiter);
    const headers = rawHeaders.map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());

    // Mapeamento de índices das colunas (flexível para Hotmart e CSV geral)
    const findExact = (names: string[]) =>
      headers.findIndex((h) => names.some((n) => h === n));

    // Coluna do comprador: primeiro busca exato 'nome' ou 'nome do comprador' ou 'cliente'
    let idxName = findExact(['nome', 'nome do comprador', 'cliente', 'name']);
    if (idxName === -1) {
      idxName = headers.findIndex((h) => h.includes('nome') && !h.includes('produto') && !h.includes('produtor') && !h.includes('afiliado'));
    }

    let idxDoc = findExact(['documento', 'cpf', 'cnpj', 'documento do comprador']);
    if (idxDoc === -1) {
      idxDoc = headers.findIndex((h) => (h.includes('documento') || h.includes('cpf')) && !h.includes('produtor'));
    }

    const idxEmail = findExact(['email', 'e-mail', 'e-mail do comprador']) !== -1
      ? findExact(['email', 'e-mail', 'e-mail do comprador'])
      : headers.findIndex((h) => h.includes('email') || h.includes('e-mail'));

    const idxDdd = findExact(['ddd']) !== -1
      ? findExact(['ddd'])
      : headers.findIndex((h) => h === 'ddd' || h.includes('ddd'));

    const idxPhone = findExact(['telefone', 'celular', 'phone', 'whatsapp']) !== -1
      ? findExact(['telefone', 'celular', 'phone', 'whatsapp'])
      : headers.findIndex((h) => (h.includes('telefone') || h.includes('celular') || h.includes('phone') || h.includes('whatsapp')) && !h.includes('ddd'));

    const idxProduct = findExact(['nome do produto', 'produto', 'product']) !== -1
      ? findExact(['nome do produto', 'produto', 'product'])
      : headers.findIndex((h) => h.includes('produto') || h.includes('product'));

    const idxStatus = findExact(['status']) !== -1
      ? findExact(['status'])
      : headers.findIndex((h) => h.includes('status'));

    const idxTransaction = findExact(['transação', 'transacao', 'transaction']) !== -1
      ? findExact(['transação', 'transacao', 'transaction'])
      : headers.findIndex((h) => h.includes('transa'));

    const idxPrice = findExact(['preço total', 'preco total', 'valor', 'price']) !== -1
      ? findExact(['preço total', 'preco total', 'valor', 'price'])
      : headers.findIndex((h) => h.includes('preço') || h.includes('preco') || h.includes('valor'));

    const idxCountry = findExact(['país', 'pais', 'country']) !== -1
      ? findExact(['país', 'pais', 'country'])
      : headers.findIndex((h) => h.includes('país') || h.includes('pais'));

    if (idxEmail === -1) {
      return NextResponse.json(
        { error: 'Coluna de e-mail não encontrada no CSV. Verifique se o cabeçalho contém "Email" ou "E-mail".' },
        { status: 400 }
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const row = parseCSVLine(lines[i], delimiter);
        if (row.length < 2) continue;

        const email = (row[idxEmail] || '').replace(/^"|"$/g, '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          continue;
        }

        const name = (idxName !== -1 ? row[idxName] : '').replace(/^"|"$/g, '').trim() || email.split('@')[0];
        const ddd = idxDdd !== -1 ? row[idxDdd] : '';
        const rawPhone = idxPhone !== -1 ? row[idxPhone] : '';
        const country = idxCountry !== -1 ? row[idxCountry] : 'Brasil';
        const formattedPhone = formatPhone(ddd, rawPhone, country);

        const productName = idxProduct !== -1 ? (row[idxProduct] || '').replace(/^"|"$/g, '').trim() : '';
        const saleStatus = idxStatus !== -1 ? (row[idxStatus] || '').replace(/^"|"$/g, '').trim() : '';
        const doc = idxDoc !== -1 ? (row[idxDoc] || '').replace(/^"|"$/g, '').trim() : '';
        const transaction = idxTransaction !== -1 ? (row[idxTransaction] || '').replace(/^"|"$/g, '').trim() : '';

        // Coleta tags a aplicar para este contato
        const tagsToApply = new Set<string>();

        // Tags adicionais escolhidas pelo usuário
        for (const t of additionalTags) {
          if (t.trim()) tagsToApply.add(t.trim());
        }

        // Tag inteligente pelo Produto Hotmart
        if (tagByProduct && productName) {
          tagsToApply.add(productName);
        }

        // Tag inteligente pelo Status Hotmart
        if (tagByStatus && saleStatus) {
          const statusLower = saleStatus.toLowerCase();
          if (statusLower.includes('aprovado') || statusLower.includes('completo')) {
            tagsToApply.add('Cliente');
            tagsToApply.add('Compra Aprovada');
          } else if (statusLower.includes('aguardando') || statusLower.includes('pendente')) {
            tagsToApply.add('Aguardando Pagamento');
          } else if (statusLower.includes('cancelado')) {
            tagsToApply.add('Cancelado');
          }
        }

        // Upsert do contato
        const existing = await prisma.contact.findUnique({
          where: { tenantId_email: { tenantId, email } },
        });

        const customFieldsObj: any = {};
        if (doc) customFieldsObj.documento = doc;
        if (transaction) customFieldsObj.transacaoHotmart = transaction;
        if (productName) customFieldsObj.ultimoProduto = productName;
        if (saleStatus) customFieldsObj.statusVenda = saleStatus;

        let contactId = '';

        if (existing) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: name || existing.name,
              phone: formattedPhone || existing.phone,
              customFields: JSON.stringify({
                ...(existing.customFields ? JSON.parse(existing.customFields) : {}),
                ...customFieldsObj,
              }),
            },
          });
          contactId = existing.id;
          updatedCount++;
        } else {
          const created = await prisma.contact.create({
            data: {
              tenantId,
              name,
              email,
              phone: formattedPhone,
              utmSource: 'importacao_csv_hotmart',
              utmCampaign: productName ? productName.slice(0, 50) : 'import_geral',
              customFields: Object.keys(customFieldsObj).length > 0 ? JSON.stringify(customFieldsObj) : null,
              consentGiven: true,
              status: 'ACTIVE',
            },
          });
          contactId = created.id;
          createdCount++;
        }

        // Vincula as tags ao contato
        for (const tagName of Array.from(tagsToApply)) {
          const tag = await prisma.tag.upsert({
            where: { tenantId_name: { tenantId, name: tagName } },
            update: {},
            create: {
              tenantId,
              name: tagName,
              color: tagName === 'Cliente' ? '#10b981' : tagName.includes('Aguardando') ? '#f59e0b' : '#6366f1',
            },
          });

          await prisma.contactTag.upsert({
            where: { contactId_tagId: { contactId, tagId: tag.id } },
            update: {},
            create: { contactId, tagId: tag.id },
          });

          // Dispara transições de tags (saídas de sequências antigas e entradas em novas)
          await automationEngine.handleContactTagAdded(tenantId, contactId, tagName).catch(() => {});
        }

        // Opcional: disparar automações ativas
        if (triggerAutomation) {
          const automations = await prisma.automation.findMany({
            where: { tenantId, status: 'ACTIVE' },
          });
          for (const auto of automations) {
            if (auto.triggerType === 'CONTACT_CREATED' && !existing) {
              await automationEngine.enrollContact(auto.id, contactId).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        errorCount++;
        if (errors.length < 5) {
          errors.push(`Linha ${i + 1}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalRows: lines.length - 1,
      created: createdCount,
      updated: updatedCount,
      errorsCount: errorCount,
      errorSamples: errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
