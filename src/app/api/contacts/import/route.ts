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

// Utilitário para limpar strings, remover aspas soltas e tratar valores vazios como (none) ou null
function cleanValue(val?: string): string {
  if (!val) return '';
  const trimmed = val.replace(/^["'\s]+|["'\s]+$/g, '').trim();
  const lower = trimmed.toLowerCase();
  if (lower === '(none)' || lower === 'none' || lower === 'null' || lower === 'undefined' || lower === '-') {
    return '';
  }
  return trimmed;
}

// Utilitário para sanitizar nome do comprador com fallback elegante
function cleanName(val?: string, email?: string): string {
  const cleaned = cleanValue(val);
  if (cleaned) return cleaned;
  if (email && email.includes('@')) {
    const prefix = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const formatted = prefix
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    if (formatted) return formatted;
  }
  return 'Contato';
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
    let tagMode: 'UNIFIED' | 'SEPARATE' = 'UNIFIED'; // UNIFIED = tag única com produto + status (evita duplicidade em múltiplos produtos)
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
      tagMode = (formData.get('tagMode') as any) === 'SEPARATE' ? 'SEPARATE' : 'UNIFIED';
      triggerAutomation = formData.get('triggerAutomation') === 'true';
    } else {
      const body = await request.json();
      csvContent = body.csvContent || '';
      additionalTags = body.tags || [];
      tagByProduct = body.tagByProduct !== false;
      tagByStatus = body.tagByStatus !== false;
      tagMode = body.tagMode === 'SEPARATE' ? 'SEPARATE' : 'UNIFIED';
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

    // 1. Coluna do Comprador / Lead: prioriza comprador/cliente específico
    let idxName = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && h.includes('nome')
    );
    if (idxName === -1) {
      idxName = findExact([
        'nome comprador(a)',
        'nome comprador',
        'nome do comprador',
        'nome cliente',
        'nome do cliente',
        'nome completo',
        'nome',
        'name',
        'full name',
        'first name',
        'comprador(a)',
        'comprador',
        'cliente',
      ]);
    }
    if (idxName === -1) {
      // Fallback: qualquer coluna com 'nome' ou 'name' que NÃO seja de produto, produtor, afiliado, preço, oferta, cupom, taxa
      idxName = headers.findIndex((h) => 
        (h.includes('nome') || h.includes('name')) &&
        !h.includes('produto') &&
        !h.includes('produtor') &&
        !h.includes('afiliado') &&
        !h.includes('preço') &&
        !h.includes('preco') &&
        !h.includes('oferta') &&
        !h.includes('cupom') &&
        !h.includes('taxa')
      );
    }

    // 2. Documento do Comprador
    let idxDoc = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && 
      (h.includes('documento') || h.includes('cpf') || h.includes('cnpj'))
    );
    if (idxDoc === -1) {
      idxDoc = findExact(['documento', 'cpf', 'cnpj', 'documento do comprador', 'cpf/cnpj']);
    }
    if (idxDoc === -1) {
      idxDoc = headers.findIndex((h) => 
        (h.includes('documento') || h.includes('cpf') || h.includes('cnpj')) &&
        !h.includes('produtor') &&
        !h.includes('afiliado')
      );
    }

    // 3. Email do Comprador
    let idxEmail = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && (h.includes('email') || h.includes('e-mail'))
    );
    if (idxEmail === -1) {
      idxEmail = findExact(['email', 'e-mail', 'email do comprador', 'e-mail do comprador']);
    }
    if (idxEmail === -1) {
      idxEmail = headers.findIndex((h) => 
        (h.includes('email') || h.includes('e-mail')) &&
        !h.includes('produtor') &&
        !h.includes('afiliado')
      );
    }

    // 4. DDD
    const idxDdd = findExact(['ddd']) !== -1
      ? findExact(['ddd'])
      : headers.findIndex((h) => h === 'ddd' || h.includes('ddd'));

    // 5. Telefone do Comprador
    let idxPhone = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && 
      (h.includes('telefone') || h.includes('celular') || h.includes('phone') || h.includes('whatsapp')) &&
      !h.includes('ddd')
    );
    if (idxPhone === -1) {
      idxPhone = findExact(['telefone', 'celular', 'phone', 'whatsapp', 'telefone celular', 'whatsapp do comprador']);
    }
    if (idxPhone === -1) {
      idxPhone = headers.findIndex((h) => 
        (h.includes('telefone') || h.includes('celular') || h.includes('phone') || h.includes('whatsapp')) &&
        !h.includes('ddd') &&
        !h.includes('produtor') &&
        !h.includes('afiliado')
      );
    }

    // 6. Produto
    let idxProduct = findExact(['nome do produto', 'produto', 'product']);
    if (idxProduct === -1) {
      idxProduct = headers.findIndex((h) => 
        (h.includes('produto') || h.includes('product')) &&
        !h.includes('código') &&
        !h.includes('codigo') &&
        !h.includes('formato') &&
        !h.includes('produtor')
      );
    }

    // 7. Status da Transação
    const idxStatus = findExact(['status', 'status da transação', 'status da transacao']) !== -1
      ? findExact(['status', 'status da transação', 'status da transacao'])
      : headers.findIndex((h) => h.includes('status'));

    // 8. Código da Transação
    const idxTransaction = findExact(['código da transação', 'codigo da transacao', 'transação', 'transacao', 'transaction']) !== -1
      ? findExact(['código da transação', 'codigo da transacao', 'transação', 'transacao', 'transaction'])
      : headers.findIndex((h) => h.includes('transa'));

    // 9. Preço / Valor
    let idxPrice = findExact(['preço da oferta', 'valor total da compra', 'preço total', 'preco total', 'preço total convertido', 'valor', 'price']);
    if (idxPrice === -1) {
      idxPrice = headers.findIndex((h) => 
        (h.includes('preço') || h.includes('preco') || h.includes('valor')) &&
        !h.includes('código') &&
        !h.includes('codigo') &&
        !h.includes('nome') &&
        !h.includes('taxa') &&
        !h.includes('frete')
      );
    }

    // 10. País
    let idxCountry = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && (h.includes('país') || h.includes('pais') || h.includes('country'))
    );
    if (idxCountry === -1) {
      idxCountry = findExact(['país', 'pais', 'country']);
    }
    if (idxCountry === -1) {
      idxCountry = headers.findIndex((h) => (h.includes('país') || h.includes('pais') || h.includes('country')) && !h.includes('produtor'));
    }

    // 11. Cidade / Estado / Instagram do Comprador
    const idxCity = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && h.includes('cidade')
    ) !== -1
      ? headers.findIndex((h) => (h.includes('comprador') || h.includes('cliente')) && h.includes('cidade'))
      : findExact(['cidade', 'city']);

    const idxState = headers.findIndex((h) => 
      (h.includes('comprador') || h.includes('cliente')) && (h.includes('estado') || h.includes('província') || h.includes('provincia') || h.includes('uf'))
    ) !== -1
      ? headers.findIndex((h) => (h.includes('comprador') || h.includes('cliente')) && (h.includes('estado') || h.includes('província') || h.includes('provincia') || h.includes('uf')))
      : findExact(['estado', 'uf', 'provincia', 'state']);

    const idxInstagram = headers.findIndex((h) => h.includes('instagram'));

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

        const rawEmail = idxEmail !== -1 ? row[idxEmail] : '';
        const email = cleanValue(rawEmail).toLowerCase();
        if (!email || !email.includes('@')) {
          continue;
        }

        const rawName = idxName !== -1 ? row[idxName] : '';
        const name = cleanName(rawName, email);
        const ddd = idxDdd !== -1 ? cleanValue(row[idxDdd]) : '';
        const rawPhone = idxPhone !== -1 ? cleanValue(row[idxPhone]) : '';
        const country = idxCountry !== -1 ? cleanValue(row[idxCountry]) : 'Brasil';
        const formattedPhone = formatPhone(ddd, rawPhone, country);

        const productName = idxProduct !== -1 ? cleanValue(row[idxProduct]) : '';
        const saleStatus = idxStatus !== -1 ? cleanValue(row[idxStatus]) : '';
        const doc = idxDoc !== -1 ? cleanValue(row[idxDoc]) : '';
        const transaction = idxTransaction !== -1 ? cleanValue(row[idxTransaction]) : '';
        const city = idxCity !== -1 ? cleanValue(row[idxCity]) : '';
        const state = idxState !== -1 ? cleanValue(row[idxState]) : '';
        const instagram = idxInstagram !== -1 ? cleanValue(row[idxInstagram]) : '';
        const price = idxPrice !== -1 ? cleanValue(row[idxPrice]) : '';

        // Coleta tags a aplicar para este contato
        const tagsToApply = new Set<string>();

        // Tags adicionais escolhidas pelo usuário
        for (const t of additionalTags) {
          if (t.trim()) tagsToApply.add(t.trim());
        }

        const statusLower = (saleStatus || '').toLowerCase();
        const isApproved = statusLower.includes('aprovado') || statusLower.includes('completo');
        const isWaiting = statusLower.includes('aguardando') || statusLower.includes('pendente');
        const isCancelled = statusLower.includes('cancelado');

        // Criação de Tags conforme o modo configurado
        if (tagMode === 'UNIFIED') {
          // Tag Unificada por Produto (Ex: "Cliente: Imersão Busca e Apreensão de Veículos - Compra Aprovada")
          if (productName) {
            if (isApproved) {
              tagsToApply.add(`Cliente: ${productName} - Compra Aprovada`);
            } else if (isWaiting) {
              tagsToApply.add(`Aguardando Pagamento: ${productName}`);
            } else if (isCancelled) {
              tagsToApply.add(`Cancelado: ${productName}`);
            } else if (tagByProduct) {
              tagsToApply.add(productName);
            }
          } else {
            if (isApproved) tagsToApply.add('Cliente Compra Aprovada');
            else if (isWaiting) tagsToApply.add('Aguardando Pagamento');
          }
        } else {
          // Tags separadas (#Produto e #Situação)
          if (tagByProduct && productName) {
            tagsToApply.add(productName);
          }
          if (tagByStatus && saleStatus) {
            if (isApproved) {
              tagsToApply.add('Cliente');
              tagsToApply.add('Compra Aprovada');
            } else if (isWaiting) {
              tagsToApply.add('Aguardando Pagamento');
            } else if (isCancelled) {
              tagsToApply.add('Cancelado');
            }
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
        if (city) customFieldsObj.cidade = city;
        if (state) customFieldsObj.estado = state;
        if (instagram) customFieldsObj.instagram = instagram;
        if (price) customFieldsObj.valorCompra = price;

        let contactId = '';

        if (existing) {
          const isCurrentNameInvalid =
            !existing.name ||
            existing.name.toLowerCase() === '(none)' ||
            existing.name.toLowerCase() === 'none' ||
            existing.name.toLowerCase() === 'contato' ||
            existing.name === existing.email.split('@')[0];

          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: (name && name !== 'Contato') ? name : (isCurrentNameInvalid ? name : existing.name),
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
              color: tagName.includes('Cliente') || tagName.includes('Aprovada') ? '#10b981' : tagName.includes('Aguardando') ? '#f59e0b' : '#6366f1',
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

        // Se a compra for aprovada, remove tags transitórias de cobrança do lead
        if (isApproved) {
          const transitory = ['Aguardando Pagamento', 'Pix Gerado', 'Boleto Gerado', 'Carrinho Abandonado'];
          const tagsToRemove = await prisma.tag.findMany({
            where: { tenantId, name: { in: transitory } },
          });
          if (tagsToRemove.length > 0) {
            await prisma.contactTag.deleteMany({
              where: {
                contactId,
                tagId: { in: tagsToRemove.map((t) => t.id) },
              },
            });
          }
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
