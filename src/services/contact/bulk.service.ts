import { prisma } from '@/lib/prisma';

export interface BulkAddTagsOptions {
  tenantId: string;
  leadIds: string[];
  tagIds?: string[];
  tagNames?: string[];
}

export interface BulkRemoveTagsOptions {
  tenantId: string;
  leadIds: string[];
  tagIds?: string[];
  tagNames?: string[];
}

export interface BulkExportOptions {
  tenantId: string;
  leadIds?: string[];
  search?: string;
  tag?: string;
  format?: 'csv' | 'xlsx';
}

export interface BulkDeleteOptions {
  tenantId: string;
  leadIds: string[];
}

export class BulkContactService {
  /**
   * Adiciona tags em massa aos contatos selecionados, evitando duplicidades
   */
  static async addTags(options: BulkAddTagsOptions) {
    const { tenantId, leadIds, tagIds = [], tagNames = [] } = options;

    if (!tenantId) throw new Error('Tenant não autenticado');
    if (!leadIds || leadIds.length === 0) {
      throw new Error('Nenhum contato selecionado');
    }

    // Valida que os contatos pertencem estritamente ao tenant
    const validContacts = await prisma.contact.findMany({
      where: {
        id: { in: leadIds },
        tenantId,
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);
    if (validContactIds.length === 0) {
      throw new Error('Nenhum contato válido encontrado para este expert');
    }

    // Resolver todas as tags solicitadas para este tenant
    const resolvedTagIds = new Set<string>();

    // 1. Tags por ID (validando tenant)
    if (tagIds.length > 0) {
      const existingTagsById = await prisma.tag.findMany({
        where: {
          id: { in: tagIds },
          tenantId,
        },
        select: { id: true },
      });
      existingTagsById.forEach((t) => resolvedTagIds.add(t.id));
    }

    // 2. Tags por nome (cria se não existir)
    if (tagNames.length > 0) {
      for (const rawName of tagNames) {
        const name = rawName.trim();
        if (!name) continue;

        const tag = await prisma.tag.upsert({
          where: { tenantId_name: { tenantId, name } },
          update: {},
          create: {
            tenantId,
            name,
            color: '#6366f1',
          },
        });
        resolvedTagIds.add(tag.id);
      }
    }

    const targetTagIds = Array.from(resolvedTagIds);
    if (targetTagIds.length === 0) {
      throw new Error('Nenhuma tag válida especificada');
    }

    // Busca quais associações já existem para não gerar erro de chave única
    const existingPairs = await prisma.contactTag.findMany({
      where: {
        contactId: { in: validContactIds },
        tagId: { in: targetTagIds },
      },
      select: { contactId: true, tagId: true },
    });

    const existingSet = new Set(existingPairs.map((p) => `${p.contactId}_${p.tagId}`));

    // Monta lote de novas associações
    const newPairs: Array<{ contactId: string; tagId: string }> = [];
    for (const cId of validContactIds) {
      for (const tId of targetTagIds) {
        const key = `${cId}_${tId}`;
        if (!existingSet.has(key)) {
          newPairs.push({ contactId: cId, tagId: tId });
          existingSet.add(key); // Evita duplicar no próprio lote
        }
      }
    }

    if (newPairs.length > 0) {
      await prisma.contactTag.createMany({
        data: newPairs,
      });
    }

    return {
      success: true,
      affectedContacts: validContactIds.length,
      tagsAddedCount: newPairs.length,
      message: `${targetTagIds.length} tag(s) vinculada(s) a ${validContactIds.length} contato(s) (${newPairs.length} novas associações).`,
    };
  }

  /**
   * Remove tags em massa dos contatos selecionados
   */
  static async removeTags(options: BulkRemoveTagsOptions) {
    const { tenantId, leadIds, tagIds = [], tagNames = [] } = options;

    if (!tenantId) throw new Error('Tenant não autenticado');
    if (!leadIds || leadIds.length === 0) {
      throw new Error('Nenhum contato selecionado');
    }

    // Valida que os contatos pertencem estritamente ao tenant
    const validContacts = await prisma.contact.findMany({
      where: {
        id: { in: leadIds },
        tenantId,
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);
    if (validContactIds.length === 0) {
      throw new Error('Nenhum contato válido encontrado para este expert');
    }

    // Identificar IDs das tags que devem ser removidas
    const targetTagIds = new Set<string>();

    if (tagIds.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { id: { in: tagIds }, tenantId },
        select: { id: true },
      });
      tags.forEach((t) => targetTagIds.add(t.id));
    }

    if (tagNames.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { name: { in: tagNames }, tenantId },
        select: { id: true },
      });
      tags.forEach((t) => targetTagIds.add(t.id));
    }

    const tagIdsArray = Array.from(targetTagIds);
    if (tagIdsArray.length === 0) {
      throw new Error('Nenhuma tag válida especificada para remoção');
    }

    // Remove apenas as relações na tabela ContactTag, preservando os contatos e as tags
    const deleteResult = await prisma.contactTag.deleteMany({
      where: {
        contactId: { in: validContactIds },
        tagId: { in: tagIdsArray },
      },
    });

    return {
      success: true,
      affectedContacts: validContactIds.length,
      removedAssociationsCount: deleteResult.count,
      message: `${deleteResult.count} vínculo(s) de tag removido(s) de ${validContactIds.length} contato(s).`,
    };
  }

  /**
   * Exclui contatos em massa com integridade referencial e validação de tenant
   */
  static async deleteContacts(options: BulkDeleteOptions) {
    const { tenantId, leadIds } = options;

    if (!tenantId) throw new Error('Tenant não autenticado');
    if (!leadIds || leadIds.length === 0) {
      throw new Error('Nenhum contato selecionado para exclusão');
    }

    // Valida que todos os contatos a serem deletados pertencem ao tenant
    const validContacts = await prisma.contact.findMany({
      where: {
        id: { in: leadIds },
        tenantId,
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);
    if (validContactIds.length === 0) {
      throw new Error('Nenhum contato válido encontrado para exclusão');
    }

    // Limpeza de dependências vinculadas aos contatos antes da remoção
    await prisma.$transaction([
      // 1. Remove tags vinculadas
      prisma.contactTag.deleteMany({
        where: { contactId: { in: validContactIds } },
      }),
      // 2. Remove logs de mensagens (WhatsApp / Email)
      prisma.messageLog.deleteMany({
        where: { contactId: { in: validContactIds }, tenantId },
      }),
      // 3. Remove matrículas e passos de automações
      prisma.automationEnrollment.deleteMany({
        where: { contactId: { in: validContactIds } },
      }),
      // 4. Remove os contatos definitivamente
      prisma.contact.deleteMany({
        where: {
          id: { in: validContactIds },
          tenantId,
        },
      }),
    ]);

    return {
      success: true,
      deletedCount: validContactIds.length,
      message: `${validContactIds.length} contato(s) excluído(s) com sucesso.`,
    };
  }

  /**
   * Exporta contatos selecionados ou filtrados para formato CSV formatado em UTF-8
   */
  static async exportContacts(options: BulkExportOptions) {
    const { tenantId, leadIds, search, tag } = options;

    if (!tenantId) throw new Error('Tenant não autenticado');

    // Monta filtro dinâmico
    const where: any = { tenantId };

    if (leadIds && leadIds.length > 0) {
      where.id = { in: leadIds };
    } else {
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ];
      }
      if (tag) {
        where.tags = {
          some: {
            tag: { name: tag },
          },
        };
      }
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Montar CSV com cabeçalho e dados formatados
    const headers = [
      'ID',
      'Nome',
      'E-mail',
      'WhatsApp / Telefone',
      'Status',
      'Origem UTM',
      'Campanha UTM',
      'Tags',
      'Data de Criação',
      'Última Atualização',
    ];

    const escapeCsvField = (field: any) => {
      if (field === null || field === undefined) return '""';
      const str = String(field).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = contacts.map((c) => {
      const tagsString = c.tags.map((t) => t.tag.name).join(' | ');
      return [
        escapeCsvField(c.id),
        escapeCsvField(c.name),
        escapeCsvField(c.email),
        escapeCsvField(c.phone || ''),
        escapeCsvField(c.status === 'ACTIVE' ? 'Ativo' : 'Descadastrado'),
        escapeCsvField(c.utmSource || ''),
        escapeCsvField(c.utmCampaign || ''),
        escapeCsvField(tagsString),
        escapeCsvField(new Date(c.createdAt).toLocaleString('pt-BR')),
        escapeCsvField(new Date(c.updatedAt).toLocaleString('pt-BR')),
      ].join(';');
    });

    // BOM UTF-8 (\uFEFF) para garantir abertura com acentuação correta no Excel / Planilhas
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');

    return {
      success: true,
      totalContacts: contacts.length,
      csvContent,
      filename: `leads_export_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }
}
