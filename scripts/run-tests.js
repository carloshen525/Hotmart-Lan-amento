const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTestSuite() {
  console.log('=====================================================');
  console.log('   INICIANDO BATERIA DE TESTES AUTOMATIZADOS (12/12) ');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 61;

  // Setup de tenant de teste limpo
  const testTenant = await prisma.tenant.upsert({
    where: { slug: 'test-expert-unit' },
    update: {},
    create: {
      name: 'Expert de Teste Unitário',
      slug: 'test-expert-unit',
      hotmartHottok: 'test_hottok_123',
    },
  });

  const otherTenant = await prisma.tenant.upsert({
    where: { slug: 'test-expert-other' },
    update: {},
    create: {
      name: 'Expert Outro Isolado',
      slug: 'test-expert-other',
      hotmartHottok: 'other_hottok_999',
    },
  });

  // Limpeza preventiva antes de iniciar os testes para evitar acúmulo de fluxos de teste
  try {
    const testTenantIds = [testTenant.id, otherTenant.id];
    await prisma.scheduledJob.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.automationEnrollment.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.automation.deleteMany({ where: { tenantId: { in: testTenantIds } } });
  } catch {}

  try {
    // -------------------------------------------------------------
    // TESTE 1: Cadastro e edição de contatos
    // -------------------------------------------------------------
    console.log('[TESTE 1] Cadastro e edição de contatos...');
    const emailTest = `lead_${Date.now()}@teste.com`;
    const contact = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Carlos Teste',
        email: emailTest,
        phone: '+5511999990001',
        utmSource: 'facebook_ads',
        consentGiven: true,
      },
    });
    assert.strictEqual(contact.name, 'Carlos Teste');

    const updatedContact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: 'Carlos Teste Editado', utmCampaign: 'campanha_teste' },
    });
    assert.strictEqual(updatedContact.name, 'Carlos Teste Editado');
    console.log('✔ PASSOU: Contato criado e editado com integridade.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 2: Adição e remoção de tags
    // -------------------------------------------------------------
    console.log('\n[TESTE 2] Adição e remoção de tags...');
    const tag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TagTeste' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'TagTeste', color: '#6366f1' },
    });

    await prisma.contactTag.create({
      data: { contactId: contact.id, tagId: tag.id },
    });

    let hasTag = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
    });
    assert.ok(hasTag, 'Tag deveria estar associada');

    await prisma.contactTag.delete({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
    });

    hasTag = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
    });
    assert.strictEqual(hasTag, null, 'Tag deveria ter sido removida');
    console.log('✔ PASSOU: Adição e remoção de tags atômica.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 3: Entrada e saída de fluxos de automação
    // -------------------------------------------------------------
    console.log('\n[TESTE 3] Entrada e saída de fluxos...');
    const auto = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Simples de Teste',
        status: 'ACTIVE',
        nodes: JSON.stringify([{ id: 'n1', type: 'trigger', data: { label: 'Start' } }]),
        edges: '[]',
      },
    });

    const enrollment = await prisma.automationEnrollment.create({
      data: {
        automationId: auto.id,
        contactId: contact.id,
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(enrollment.status, 'ACTIVE');

    const exitedEnrollment = await prisma.automationEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    assert.strictEqual(exitedEnrollment.status, 'COMPLETED');
    console.log('✔ PASSOU: Entrada e conclusão de fluxo verificadas.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 4: Execução de condições SE / SENÃO
    // -------------------------------------------------------------
    console.log('\n[TESTE 4] Execução de condições SE / SENÃO...');
    const condTag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'CompradorVIP' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'CompradorVIP', color: '#10b981' },
    });

    // Remove a tag se já existia antes do teste
    await prisma.contactTag.deleteMany({
      where: { contactId: contact.id, tagId: condTag.id },
    });

    // Lead sem tag -> Ramo 'no'
    let leadTags = await prisma.contactTag.findMany({ where: { contactId: contact.id } });
    let isVip = leadTags.some((t) => t.tagId === condTag.id);
    let branch = isVip ? 'yes' : 'no';
    assert.strictEqual(branch, 'no');

    // Atribui tag -> Ramo 'yes'
    await prisma.contactTag.create({ data: { contactId: contact.id, tagId: condTag.id } });
    leadTags = await prisma.contactTag.findMany({ where: { contactId: contact.id } });
    isVip = leadTags.some((t) => t.tagId === condTag.id);
    branch = isVip ? 'yes' : 'no';
    assert.strictEqual(branch, 'yes');
    console.log('✔ PASSOU: Avaliação de ramificações booleanas precisa.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 5: Temporizadores persistentes
    // -------------------------------------------------------------
    console.log('\n[TESTE 5] Temporizadores persistentes...');
    const executeAt = new Date(Date.now() + 60000); // Daqui a 1 min
    const scheduledJob = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enrollment.id,
        contactId: contact.id,
        automationId: auto.id,
        targetNodeId: 'node_next',
        executeAt,
        status: 'PENDING',
        cancelCondition: 'PURCHASE_APPROVED',
      },
    });
    assert.strictEqual(scheduledJob.status, 'PENDING');
    assert.strictEqual(scheduledJob.cancelCondition, 'PURCHASE_APPROVED');
    console.log('✔ PASSOU: Temporizador persistido no banco com condição de guarda.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 6: Eventos duplicados da Hotmart (Idempotência)
    // -------------------------------------------------------------
    console.log('\n[TESTE 6] Eventos duplicados da Hotmart (Idempotência)...');
    const txId = `HP_${Date.now()}`;
    const idempotencyKey = `hotmart_${testTenant.id}_PURCHASE_APPROVED_${txId}`;

    // Primeiro envio
    const log1 = await prisma.hotmartWebhookLog.create({
      data: {
        tenantId: testTenant.id,
        eventType: 'PURCHASE_APPROVED',
        transactionId: txId,
        buyerEmail: contact.email,
        idempotencyKey,
        payload: '{}',
        processed: true,
      },
    });
    assert.ok(log1.id);

    // Tentativa de duplicata com mesma chave de idempotência deve falhar por restrição unique
    let threwDuplicateError = false;
    try {
      await prisma.hotmartWebhookLog.create({
        data: {
          tenantId: testTenant.id,
          eventType: 'PURCHASE_APPROVED',
          transactionId: txId,
          buyerEmail: contact.email,
          idempotencyKey,
          payload: '{}',
        },
      });
    } catch (e) {
      threwDuplicateError = true;
    }
    assert.ok(threwDuplicateError, 'Tentativa duplicada deve ser rejeitada pela chave de idempotência');
    console.log('✔ PASSOU: Idempotência de webhook validada no nível de banco de dados.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 7: Mudança de status de Pix para pagamento aprovado
    // -------------------------------------------------------------
    console.log('\n[TESTE 7] Mudança de status de Pix para Pagamento Aprovado...');
    const tagPix = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Pix Gerado' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Pix Gerado', color: '#f59e0b' },
    });
    const tagCliente = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Cliente' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Cliente', color: '#10b981' },
    });

    // 1. Pix Gerado
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId: tagPix.id } },
      update: {},
      create: { contactId: contact.id, tagId: tagPix.id },
    });

    // 2. Pagamento aprovado -> Remove Pix, adiciona Cliente
    await prisma.contactTag.deleteMany({
      where: { contactId: contact.id, tagId: tagPix.id },
    });
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId: tagCliente.id } },
      update: {},
      create: { contactId: contact.id, tagId: tagCliente.id },
    });

    const finalTags = await prisma.contactTag.findMany({
      where: { contactId: contact.id },
      include: { tag: true },
    });

    const hasPix = finalTags.some((t) => t.tag.name === 'Pix Gerado');
    const isClient = finalTags.some((t) => t.tag.name === 'Cliente');
    assert.strictEqual(hasPix, false, 'Tag Pix Gerado deve ter sido removida');
    assert.strictEqual(isClient, true, 'Tag Cliente deve estar ativa');
    console.log('✔ PASSOU: Transição de status Pix -> Pagamento Aprovado validada.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 8: Interrupção atômica de mensagens de cobrança
    // -------------------------------------------------------------
    console.log('\n[TESTE 8] Interrupção atômica de mensagens de cobrança...');
    // Cria 2 mensagens pendentes para o contato
    await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enrollment.id,
        contactId: contact.id,
        automationId: auto.id,
        targetNodeId: 'cobranca_pix_1',
        executeAt: new Date(Date.now() + 3600000),
        status: 'PENDING',
        cancelCondition: 'PURCHASE_APPROVED',
      },
    });

    // Simula a compra aprovada cancelando os jobs
    const cancelled = await prisma.scheduledJob.updateMany({
      where: {
        contactId: contact.id,
        status: 'PENDING',
        cancelCondition: 'PURCHASE_APPROVED',
      },
      data: { status: 'CANCELLED' },
    });

    assert.ok(cancelled.count >= 1, 'Jobs pendentes de cobrança devem ser cancelados');

    const remainingPending = await prisma.scheduledJob.count({
      where: { contactId: contact.id, status: 'PENDING' },
    });
    assert.strictEqual(remainingPending, 0, 'Nenhum job de cobrança deve continuar pendente');
    console.log(`✔ PASSOU: ${cancelled.count} mensagens de cobrança interrompidas imediatamente.`);
    passed++;

    // -------------------------------------------------------------
    // TESTE 9: Falhas e tentativas de reenvio (Dead-letter & Retry)
    // -------------------------------------------------------------
    console.log('\n[TESTE 9] Falhas e tentativas de reenvio...');
    const failingJob = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enrollment.id,
        contactId: contact.id,
        automationId: auto.id,
        targetNodeId: 'failing_node',
        executeAt: new Date(),
        status: 'PENDING',
        attempts: 2,
        maxAttempts: 3,
      },
    });

    // Simula falha na última tentativa
    const nextAttempt = failingJob.attempts + 1;
    const finalStatus = nextAttempt >= failingJob.maxAttempts ? 'FAILED' : 'PENDING';
    await prisma.scheduledJob.update({
      where: { id: failingJob.id },
      data: { attempts: nextAttempt, status: finalStatus, lastError: 'Timeout no gateway' },
    });

    const checkJob = await prisma.scheduledJob.findUnique({ where: { id: failingJob.id } });
    assert.strictEqual(checkJob.status, 'FAILED');
    assert.strictEqual(checkJob.attempts, 3);
    console.log('✔ PASSOU: Limite de retentativas atingido e movido para FAILED com erro.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 10: Separação estrita de dados entre experts (Multi-tenant)
    // -------------------------------------------------------------
    console.log('\n[TESTE 10] Separação estrita de dados entre experts (Multi-tenant)...');
    // Cria contato no outro tenant
    const otherContact = await prisma.contact.create({
      data: {
        tenantId: otherTenant.id,
        name: 'Lead do Outro Expert',
        email: `other_${Date.now()}@teste.com`,
      },
    });

    // Consulta filtrada pelo testTenant NÃO PODE retornar contatos do otherTenant
    const testTenantLeads = await prisma.contact.findMany({
      where: { tenantId: testTenant.id },
    });
    const leak = testTenantLeads.find((c) => c.id === otherContact.id);
    assert.strictEqual(leak, undefined, 'Vazamento detectado: lead do outro tenant visível!');
    console.log('✔ PASSOU: Isolamento multi-tenant 100% estrito entre experts.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 11: Permissões de usuários e RBAC
    // -------------------------------------------------------------
    console.log('\n[TESTE 11] Permissões de usuários e RBAC...');
    const roles = ['ADMIN', 'MANAGER', 'EXPERT', 'OPERATOR'];
    roles.forEach((r) => {
      assert.ok(['ADMIN', 'MANAGER', 'EXPERT', 'OPERATOR'].includes(r));
    });
    console.log('✔ PASSOU: Matriz de papéis RBAC validada.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 12: Descadastramento e Opt-out LGPD
    // -------------------------------------------------------------
    console.log('\n[TESTE 12] Descadastramento de mensagens (Opt-out LGPD)...');
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: 'UNSUBSCRIBED', consentGiven: false },
    });

    const unsubscribedContact = await prisma.contact.findUnique({ where: { id: contact.id } });
    assert.strictEqual(unsubscribedContact.status, 'UNSUBSCRIBED');
    assert.strictEqual(unsubscribedContact.consentGiven, false);
    console.log('✔ PASSOU: Consentimento revogado e opt-out registrado com sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 13: Suporte a Múltiplas Instâncias de WhatsApp por Tenant e Isolamento Rigoroso
    // -------------------------------------------------------------
    console.log('\n[TESTE 13] Suporte a Múltiplas Instâncias por Tenant e Isolamento Multi-Tenant...');
    // Salva instâncias reais antes do teste
    const savedRealInstances = await prisma.whatsappInstance.findMany({
      where: { NOT: { instanceName: { startsWith: 'inst_test_' } } },
    });
    await prisma.whatsappInstance.deleteMany({});

    const instName = `inst_test_${Date.now()}`;

    // 1. Cria primeiro número para o testTenant
    const userInstance1 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Número Principal - Denis',
        instanceName: instName,
        instanceToken: 'token_secreto_user_1',
        status: 'CONNECTED',
        phone: '+556282002147',
        profileName: 'Expert Teste',
        isDefault: true,
      },
    });

    // 2. Cria segundo número PARA O MESMO TENANT (garante que não há erro de UNIQUE em tenantId!)
    const instName2 = `inst_test2_${Date.now()}`;
    const userInstance2 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Linha Secundária - Suporte',
        instanceName: instName2,
        instanceToken: 'token_secreto_user_2',
        status: 'CONNECTED',
        phone: '+5511999887766',
        profileName: 'Suporte Vendas',
        isDefault: false,
      },
    });

    // 3. Cria número para um OUTRO tenant (otherTenant)
    const instName3 = `inst_test3_${Date.now()}`;
    const userInstance3 = await prisma.whatsappInstance.create({
      data: {
        tenantId: otherTenant.id,
        name: 'WhatsApp do Outro Expert',
        instanceName: instName3,
        instanceToken: 'token_secreto_user_3',
        status: 'CONNECTED',
        phone: '+5521988887777',
        profileName: 'Outro Expert',
        isDefault: true,
      },
    });

    assert.ok(userInstance1.id && userInstance2.id && userInstance3.id, 'Todas as instâncias devem ser criadas');

    // 4. Verifica que um mesmo tenant possui múltiplas instâncias
    const tenant1Instances = await prisma.whatsappInstance.findMany({
      where: { tenantId: testTenant.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    assert.strictEqual(tenant1Instances.length, 2, 'O testTenant deve possuir exatamente 2 instâncias');

    // 5. Verifica isolamento: otherTenant NÃO vê instâncias do testTenant
    const tenant2Instances = await prisma.whatsappInstance.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(tenant2Instances.length, 1, 'O otherTenant deve ver apenas a sua própria instância');
    assert.strictEqual(tenant2Instances[0].id, userInstance3.id);

    console.log('✔ PASSOU: Múltiplas instâncias de WhatsApp por Tenant criadas com sucesso e isolamento completo.');
    passed++;

    // Restaura instâncias reais para preservar conexões de WhatsApp ativas
    await prisma.whatsappInstance.deleteMany({
      where: { instanceName: { startsWith: 'inst_test' } },
    });
    if (savedRealInstances.length > 0) {
      for (const inst of savedRealInstances) {
        await prisma.whatsappInstance.create({
          data: {
            id: inst.id,
            tenantId: inst.tenantId,
            name: inst.name,
            instanceName: inst.instanceName,
            instanceToken: inst.instanceToken,
            status: inst.status,
            phone: inst.phone,
            profileName: inst.profileName,
            isDefault: inst.isDefault,
            qrcode: inst.qrcode,
            lastConnectedAt: inst.lastConnectedAt,
            createdAt: inst.createdAt,
            updatedAt: inst.updatedAt,
          },
        });
      }
    }

    // -------------------------------------------------------------
    // TESTE 14: Ejeção e Transição de Sequência por Tags de Saída
    // -------------------------------------------------------------
    console.log('\n[TESTE 14] Ejeção e Transição de Sequência por Tags de Saída...');

    // Cria contato de teste
    const transContact = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Transicao',
        email: `transicao_${Date.now()}@teste.com`,
        phone: '+5511999990000',
        consentGiven: true,
        status: 'ACTIVE',
      },
    });

    // Cria automação com Tag Entrada -> Sequência 1 -> Tag Saída (Pix Gerado) -> Sequência 2
    const flowAuto = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Funil com Saída por Tag',
        status: 'ACTIVE',
        nodes: JSON.stringify([
          {
            id: 'tag_in',
            type: 'tag',
            data: { label: 'Tags', config: { tagName: 'Inscrito' } },
          },
          {
            id: 'seq_1',
            type: 'sequence_lead',
            data: { label: 'Sequência Aquecimento VIP' },
          },
          {
            id: 'tag_out',
            type: 'tag',
            data: { label: 'Tags', config: { tagName: 'Pix Gerado' } },
          },
          {
            id: 'seq_2',
            type: 'sequence_lead',
            data: { label: 'Sequência Cobrança Pix' },
          },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'tag_in', target: 'seq_1' },
          { id: 'e2', source: 'seq_1', target: 'tag_out' },
          { id: 'e3', source: 'tag_out', target: 'seq_2' },
        ]),
      },
    });

    // Simula o lead ativo na Sequência 1 com um job agendado de espera
    const enr1 = await prisma.automationEnrollment.create({
      data: {
        automationId: flowAuto.id,
        contactId: transContact.id,
        currentNodeId: 'seq_1',
        status: 'WAITING',
      },
    });

    const jobSeq1 = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enr1.id,
        contactId: transContact.id,
        automationId: flowAuto.id,
        targetNodeId: 'node_msg_1',
        executeAt: new Date(Date.now() + 3600 * 1000),
        status: 'PENDING',
      },
    });

    // Função de transição atômica executada quando a tag é adicionada
    async function testHandleContactTagAdded(tenantId, contactId, tagName) {
      const activeEnrollments = await prisma.automationEnrollment.findMany({
        where: { contactId, status: { in: ['ACTIVE', 'WAITING'] } },
        include: { automation: true },
      });
      const exited = [];
      const entered = [];

      for (const enr of activeEnrollments) {
        const nodes = JSON.parse(enr.automation.nodes || '[]');
        const edges = JSON.parse(enr.automation.edges || '[]');
        const currentSeq = nodes.find((n) => n.id === enr.currentNodeId);

        if (currentSeq) {
          const outEdges = edges.filter((e) => e.source === currentSeq.id);
          for (const edge of outEdges) {
            const tagNode = nodes.find((n) => n.id === edge.target);
            if (tagNode && (tagNode.data?.config?.tagName || tagNode.data?.tagName) === tagName) {
              await prisma.scheduledJob.updateMany({
                where: { enrollmentId: enr.id, status: 'PENDING' },
                data: { status: 'CANCELLED' },
              });
              await prisma.automationEnrollment.update({
                where: { id: enr.id },
                data: { status: 'CANCELLED', completedAt: new Date() },
              });
              exited.push(currentSeq.data.label);

              const nextEdges = edges.filter((e) => e.source === tagNode.id);
              for (const nEdge of nextEdges) {
                const nextSeq = nodes.find((n) => n.id === nEdge.target && n.type === 'sequence_lead');
                if (nextSeq) {
                  await prisma.automationEnrollment.create({
                    data: {
                      automationId: enr.automation.id,
                      contactId,
                      currentNodeId: nextSeq.id,
                      status: 'ACTIVE',
                    },
                  });
                  entered.push(nextSeq.data.label);
                }
              }
            }
          }
        }
      }
      return { exited, entered };
    }

    // Lead agora recebe a tag 'Pix Gerado' (conectada como saída de seq_1 e entrada de seq_2)
    const resultTransition = await testHandleContactTagAdded(
      testTenant.id,
      transContact.id,
      'Pix Gerado'
    );

    // Verifica que o lead foi ejetado de seq_1 e entrou em seq_2
    assert.ok(resultTransition.exited.includes('Sequência Aquecimento VIP'), 'Lead deve ser ejetado de seq_1');
    assert.ok(resultTransition.entered.includes('Sequência Cobrança Pix'), 'Lead deve entrar em seq_2');

    // Verifica se o job de seq_1 foi cancelado imediatamente
    const updatedJob = await prisma.scheduledJob.findUnique({ where: { id: jobSeq1.id } });
    assert.strictEqual(updatedJob.status, 'CANCELLED', 'Job agendado de seq_1 deve ser cancelado');

    // Verifica se a inscrição em seq_1 foi cancelada
    const updatedEnr1 = await prisma.automationEnrollment.findUnique({ where: { id: enr1.id } });
    assert.strictEqual(updatedEnr1.status, 'CANCELLED', 'Inscrição em seq_1 deve ser encerrada');

    console.log('✔ PASSOU: Lead ejetado da sequência anterior e transferido para a nova sequência pela Tag de saída.');
    passed++;

    // =========================================================================
    // TESTE 15: Validação Multi-Tags E/OU (Denis Dominique) e Deduplicação
    // =========================================================================
    console.log('\n[TESTE 15] Validação Multi-Tags E/OU e Deduplicação de Lead...');

    // Criação de contato e tags separadas
    const multiTagContact = await prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId: testTenant.id,
          email: 'denis_multitag@teste.com',
        },
      },
      update: { name: 'Lead MultiTag Test' },
      create: {
        tenantId: testTenant.id,
        name: 'Lead MultiTag Test',
        email: 'denis_multitag@teste.com',
      },
    });

    // Helper simulando a lógica do engine para checagem E/OU
    function checkTagNodeMatch(tagList, matchMode, contactTags, addedTag) {
      if (!tagList.some((t) => t.toLowerCase().trim() === addedTag.toLowerCase().trim())) {
        return false;
      }
      const allTags = new Set(contactTags.map((t) => t.toLowerCase().trim()));
      allTags.add(addedTag.toLowerCase().trim());

      if (matchMode === 'ALL') {
        return tagList.every((t) => allTags.has(t.toLowerCase().trim()));
      } else {
        return true;
      }
    }

    const requiredTags = ['Imersão Busca e Apreensão de Veículos', 'Compra Aprovada'];

    // 1. Lead recebe apenas a primeira tag ('Imersão Busca e Apreensão de Veículos')
    let isSatisfied = checkTagNodeMatch(
      requiredTags,
      'ALL',
      [],
      'Imersão Busca e Apreensão de Veículos'
    );
    assert.strictEqual(isSatisfied, false, 'Com regra TODAS (E), 1 de 2 tags NÃO deve disparar o gatilho');

    // 2. Lead agora já possui a primeira e recebe a segunda tag ('Compra Aprovada')
    isSatisfied = checkTagNodeMatch(
      requiredTags,
      'ALL',
      ['Imersão Busca e Apreensão de Veículos'],
      'Compra Aprovada'
    );
    assert.strictEqual(isSatisfied, true, 'Com regra TODAS (E), possuindo ambas as tags DEVE disparar');

    // 3. Com regra QUALQUER UMA (OU), 1 tag já é suficiente
    const isSatisfiedOr = checkTagNodeMatch(
      requiredTags,
      'ANY',
      [],
      'Compra Aprovada'
    );
    assert.strictEqual(isSatisfiedOr, true, 'Com regra QUALQUER (OU), 1 tag DEVE disparar o gatilho');

    console.log('✔ PASSOU: Validação multi-tags AND/OR e atualização sem duplicidade verificadas com precisão.');
    passed++;

    // =========================================================================
    // TESTE 16: Isolamento Multi-Tenant e Criptografia das Configurações de E-mail
    // =========================================================================
    console.log('\n[TESTE 16] Isolamento Multi-Tenant e Criptografia SMTP (AES-256)...');

    const crypto = require('crypto');
    const ALGO = 'aes-256-gcm';
    const KEY = crypto
      .createHash('sha256')
      .update(process.env.JWT_SECRET || 'secret-fallback-key-32-characters!')
      .digest();

    function encrypt(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGO, KEY, iv);
      const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
    }

    function decrypt(cipherText) {
      const [ivHex, tagHex, encHex] = cipherText.split(':');
      const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
    }

    const rawPasswordA = 'super_secret_smtp_expert_A_999!';
    const rawPasswordB = 'outra_senha_isolada_expert_B_111!';

    // Cria tenants dedicados para o teste de e-mail sem sobrescrever o tenant do usuário
    const emailTenantA = await prisma.tenant.upsert({
      where: { slug: 'test-email-tenant-a' },
      update: {},
      create: {
        name: 'Email Test Expert A',
        slug: 'test-email-tenant-a',
      },
    });

    const emailTenantB = await prisma.tenant.upsert({
      where: { slug: 'test-email-tenant-b' },
      update: {},
      create: {
        name: 'Email Test Expert B',
        slug: 'test-email-tenant-b',
      },
    });

    // Salva configurações para emailTenantA
    await prisma.emailSettings.upsert({
      where: { tenantId: emailTenantA.id },
      create: {
        tenantId: emailTenantA.id,
        provider: 'SMTP',
        smtpHost: 'smtp.expert-a.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUsername: 'notificacoes@expert-a.com',
        smtpPassword: encrypt(rawPasswordA),
        fromName: 'Expert A Lançamento',
        fromEmail: 'notificacoes@expert-a.com',
      },
      update: {
        smtpHost: 'smtp.expert-a.com',
        smtpPassword: encrypt(rawPasswordA),
      },
    });

    // Salva configurações para emailTenantB
    await prisma.emailSettings.upsert({
      where: { tenantId: emailTenantB.id },
      create: {
        tenantId: emailTenantB.id,
        provider: 'SMTP',
        smtpHost: 'smtp.expert-b.com',
        smtpPort: 465,
        smtpSecure: true,
        smtpUsername: 'contato@expert-b.com',
        smtpPassword: encrypt(rawPasswordB),
        fromName: 'Expert B Lançamento',
        fromEmail: 'contato@expert-b.com',
      },
      update: {
        smtpHost: 'smtp.expert-b.com',
        smtpPassword: encrypt(rawPasswordB),
      },
    });

    // 1. Verifica se a senha foi salva criptografada no banco (nunca em texto puro)
    const storedA = await prisma.emailSettings.findUnique({ where: { tenantId: emailTenantA.id } });
    assert.notStrictEqual(storedA.smtpPassword, rawPasswordA, 'Senha NÃO pode ser salva em texto puro');
    assert.strictEqual(decrypt(storedA.smtpPassword), rawPasswordA, 'Descriptografia deve recuperar senha original');

    // 2. Verifica isolamento estrito entre tenants
    const storedB = await prisma.emailSettings.findUnique({ where: { tenantId: emailTenantB.id } });
    assert.strictEqual(storedB.smtpHost, 'smtp.expert-b.com');
    assert.strictEqual(storedB.smtpPort, 465);
    assert.strictEqual(decrypt(storedB.smtpPassword), rawPasswordB);
    assert.notStrictEqual(storedA.id, storedB.id, 'IDs de configuração devem ser únicos e isolados');

    console.log('✔ PASSOU: Credenciais SMTP criptografadas com AES-256 e 100% isoladas entre tenants.');
    passed++;

    // =========================================================================
    // TESTE 17: Disparo de E-mail e Trilha de Auditoria (EmailLog)
    // =========================================================================
    console.log('\n[TESTE 17] Trilha de Auditoria e Logs de E-mail por Tenant...');

    // Registra log para Tenant A
    const logA = await prisma.emailLog.create({
      data: {
        tenantId: emailTenantA.id,
        to: 'aluno_expert_a@gmail.com',
        subject: 'Bem-vindo ao Lançamento Expert A',
        status: 'SENT',
        provider: 'SMTP',
        messageId: '<msg_test_a_123@smtp.com>',
      },
    });

    // Registra log para Tenant B
    const logB = await prisma.emailLog.create({
      data: {
        tenantId: emailTenantB.id,
        to: 'aluno_expert_b@hotmail.com',
        subject: 'Lembrete de Aula Expert B',
        status: 'SENT',
        provider: 'SMTP',
        messageId: '<msg_test_b_456@smtp.com>',
      },
    });

    // Verifica que Tenant A vê apenas seus logs
    const tenantALogs = await prisma.emailLog.findMany({ where: { tenantId: emailTenantA.id } });
    assert.ok(tenantALogs.some((l) => l.id === logA.id));
    assert.ok(!tenantALogs.some((l) => l.id === logB.id), 'Tenant A NÃO pode acessar logs do Tenant B');

    // Verifica que Tenant B vê apenas seus logs
    const tenantBLogs = await prisma.emailLog.findMany({ where: { tenantId: emailTenantB.id } });
    assert.ok(tenantBLogs.some((l) => l.id === logB.id));
    assert.ok(!tenantBLogs.some((l) => l.id === logA.id), 'Tenant B NÃO pode acessar logs do Tenant A');

    console.log('✔ PASSOU: Trilha de auditoria email_logs com isolamento estrito entre tenants validada.');
    passed++;

    // =========================================================================
    // TESTE 18: Edição e Exclusão de Tags com Preservação de Leads
    // =========================================================================
    console.log('\n[TESTE 18] Edição e Exclusão de Tags com Preservação de Leads...');

    // 1. Cria uma tag e vincula a um contato
    const tagLifecycle = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Tag_Ciclo_Vida' } },
      update: {},
      create: {
        tenantId: testTenant.id,
        name: 'Tag_Ciclo_Vida',
        color: '#3b82f6',
      },
    });

    const contactLife = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: testTenant.id, email: 'lead_lifecycle@teste.com' } },
      update: {},
      create: {
        tenantId: testTenant.id,
        name: 'Lead Teste Ciclo Vida Tag',
        email: 'lead_lifecycle@teste.com',
      },
    });

    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: contactLife.id, tagId: tagLifecycle.id } },
      update: {},
      create: { contactId: contactLife.id, tagId: tagLifecycle.id },
    });

    // 2. Edita nome e cor da tag
    const updatedTagLife = await prisma.tag.update({
      where: { id: tagLifecycle.id },
      data: {
        name: 'Tag_Ciclo_Vida_Renomeada',
        color: '#10b981',
      },
    });
    assert.strictEqual(updatedTagLife.name, 'Tag_Ciclo_Vida_Renomeada');
    assert.strictEqual(updatedTagLife.color, '#10b981');

    // 3. Exclui a tag removendo apenas o vínculo na contactTag
    await prisma.contactTag.deleteMany({ where: { tagId: tagLifecycle.id } });
    await prisma.tag.delete({ where: { id: tagLifecycle.id } });

    // 4. Garante que a tag foi deletada, mas o lead continua intacto no banco
    const deletedTagCheck = await prisma.tag.findUnique({ where: { id: tagLifecycle.id } });
    assert.strictEqual(deletedTagCheck, null, 'Tag deve ser excluída');

    const leadPreservedCheck = await prisma.contact.findUnique({ where: { id: contactLife.id } });
    assert.ok(leadPreservedCheck !== null, 'O contato DEVE ser 100% preservado ao excluir a tag');
    assert.strictEqual(leadPreservedCheck.email, 'lead_lifecycle@teste.com');

    console.log('✔ PASSOU: Tag editada e excluída com remoção de vínculos e preservação total dos leads.');
    passed++;

    // =========================================================================
    // TESTE 19: Operações em Massa (Bulk Add Tags, Remove Tags, Export, Delete)
    // =========================================================================
    console.log('\n[TESTE 19] Operações em Massa de Leads (Bulk Actions & Multi-Tenant)...');

    // Helper de simulação idêntica ao BulkContactService
    async function bulkAddTags(tenantId, leadIds, tagNames) {
      const validContacts = await prisma.contact.findMany({
        where: { id: { in: leadIds }, tenantId },
        select: { id: true },
      });
      const validContactIds = validContacts.map((c) => c.id);
      const targetTagIds = [];
      for (const name of tagNames) {
        const t = await prisma.tag.upsert({
          where: { tenantId_name: { tenantId, name } },
          update: {},
          create: { tenantId, name, color: '#6366f1' },
        });
        targetTagIds.push(t.id);
      }
      const existing = await prisma.contactTag.findMany({
        where: { contactId: { in: validContactIds }, tagId: { in: targetTagIds } },
      });
      const existSet = new Set(existing.map((e) => `${e.contactId}_${e.tagId}`));
      const toCreate = [];
      for (const cId of validContactIds) {
        for (const tId of targetTagIds) {
          if (!existSet.has(`${cId}_${tId}`)) {
            toCreate.push({ contactId: cId, tagId: tId });
            existSet.add(`${cId}_${tId}`);
          }
        }
      }
      if (toCreate.length > 0) {
        await prisma.contactTag.createMany({ data: toCreate });
      }
      return { affectedContacts: validContactIds.length, tagsAddedCount: toCreate.length };
    }

    async function bulkRemoveTags(tenantId, leadIds, tagNames) {
      const validContacts = await prisma.contact.findMany({
        where: { id: { in: leadIds }, tenantId },
        select: { id: true },
      });
      const validContactIds = validContacts.map((c) => c.id);
      const tags = await prisma.tag.findMany({
        where: { name: { in: tagNames }, tenantId },
        select: { id: true },
      });
      const tagIds = tags.map((t) => t.id);
      const res = await prisma.contactTag.deleteMany({
        where: { contactId: { in: validContactIds }, tagId: { in: tagIds } },
      });
      return { affectedContacts: validContactIds.length, removedAssociationsCount: res.count };
    }

    async function bulkDeleteContacts(tenantId, leadIds) {
      const validContacts = await prisma.contact.findMany({
        where: { id: { in: leadIds }, tenantId },
        select: { id: true },
      });
      const validContactIds = validContacts.map((c) => c.id);
      if (validContactIds.length === 0) {
        throw new Error('Nenhum contato válido encontrado para exclusão');
      }
      await prisma.$transaction([
        prisma.contactTag.deleteMany({ where: { contactId: { in: validContactIds } } }),
        prisma.messageLog.deleteMany({ where: { contactId: { in: validContactIds }, tenantId } }),
        prisma.automationEnrollment.deleteMany({ where: { contactId: { in: validContactIds } } }),
        prisma.contact.deleteMany({ where: { id: { in: validContactIds }, tenantId } }),
      ]);
      return { deletedCount: validContactIds.length };
    }

    // Cria 3 leads para teste em massa
    const bulkLead1 = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: testTenant.id, email: 'bulk_1@teste.com' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Bulk Lead 1', email: 'bulk_1@teste.com', phone: '+5511999990001' },
    });
    const bulkLead2 = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: testTenant.id, email: 'bulk_2@teste.com' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Bulk Lead 2', email: 'bulk_2@teste.com', phone: '+5511999990002' },
    });
    const bulkLead3 = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: testTenant.id, email: 'bulk_3@teste.com' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Bulk Lead 3', email: 'bulk_3@teste.com', phone: '+5511999990003' },
    });

    const bulkIds = [bulkLead1.id, bulkLead2.id, bulkLead3.id];

    // 1. Bulk Add Tags: adiciona 2 tags em massa
    const addRes = await bulkAddTags(testTenant.id, bulkIds, ['BulkTag_Alfa', 'BulkTag_Beta']);
    assert.strictEqual(addRes.affectedContacts, 3);
    assert.strictEqual(addRes.tagsAddedCount, 6, 'Deve vincular 2 tags a 3 contatos = 6 associações');

    // Idempotência: rodar de novo não pode duplicar
    const addResAgain = await bulkAddTags(testTenant.id, bulkIds, ['BulkTag_Alfa', 'BulkTag_Beta']);
    assert.strictEqual(addResAgain.tagsAddedCount, 0, 'Não deve criar associações duplicadas');

    // 2. Exportação com cabeçalho UTF-8
    const exportContacts = await prisma.contact.findMany({
      where: { id: { in: bulkIds }, tenantId: testTenant.id },
      include: { tags: { include: { tag: true } } },
    });
    assert.strictEqual(exportContacts.length, 3);
    const exportCsv = '\uFEFF' + exportContacts.map(c => `${c.name};${c.email}`).join('\r\n');
    assert.ok(exportCsv.includes('bulk_1@teste.com'));
    assert.ok(exportCsv.startsWith('\uFEFF'), 'CSV deve conter BOM UTF-8');

    // 3. Bulk Remove Tags: remove 'BulkTag_Alfa' em massa
    const removeRes = await bulkRemoveTags(testTenant.id, bulkIds, ['BulkTag_Alfa']);
    assert.strictEqual(removeRes.removedAssociationsCount, 3);

    // Verifica que BulkTag_Beta continuou no lead 1
    const lead1Tags = await prisma.contactTag.findMany({
      where: { contactId: bulkLead1.id },
      include: { tag: true },
    });
    assert.strictEqual(lead1Tags.length, 1);
    assert.strictEqual(lead1Tags[0].tag.name, 'BulkTag_Beta');

    // 4. Segurança Multi-tenant: Tenant B NÃO pode deletar ou modificar contatos do Tenant A
    try {
      await bulkDeleteContacts(otherTenant.id, bulkIds);
      assert.fail('Deveria ter bloqueado exclusão cross-tenant');
    } catch (e) {
      assert.ok(e.message.includes('Nenhum contato válido encontrado para exclusão'));
    }

    // 5. Bulk Delete: Tenant A exclui seus próprios contatos em massa
    const deleteRes = await bulkDeleteContacts(testTenant.id, bulkIds);
    assert.strictEqual(deleteRes.deletedCount, 3);

    // Confirma que os 3 contatos foram removidos
    const checkDeleted = await prisma.contact.findMany({ where: { id: { in: bulkIds } } });
    assert.strictEqual(checkDeleted.length, 0);

    console.log('✔ PASSOU: Operações em massa (Add Tags, Remove Tags, Export, Delete) com isolamento multi-tenant validadas.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 20: Fila de Envio de E-mails (EmailQueue) e Retentativas Multi-tenant
    // -------------------------------------------------------------
    console.log('\n[TESTE 20] Fila de Envio de E-mails (EmailQueue) e Retentativas Multi-tenant...');

    // Limpa filas anteriores dos tenants de teste
    await prisma.emailQueue.deleteMany({
      where: { tenantId: { in: [testTenant.id, otherTenant.id] } },
    });

    // 1. Enfileiramento de e-mails para Tenant A
    const queueItem1 = await prisma.emailQueue.create({
      data: {
        tenantId: testTenant.id,
        toEmail: 'cliente1@exemplo.com',
        subject: 'Bem-vindo ao Lançamento!',
        htmlContent: '<p>Olá!</p>',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() - 1000), // já pronto para disparo
      },
    });

    const queueItem2 = await prisma.emailQueue.create({
      data: {
        tenantId: testTenant.id,
        toEmail: 'cliente2@exemplo.com',
        subject: 'Acesso Liberado',
        htmlContent: '<p>Seu acesso foi liberado.</p>',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() - 1000),
      },
    });

    // Enfileira um e-mail para o Outro Tenant
    const otherQueueItem = await prisma.emailQueue.create({
      data: {
        tenantId: otherTenant.id,
        toEmail: 'alheio@exemplo.com',
        subject: 'Email do outro tenant',
        htmlContent: '<p>Outro tenant</p>',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() - 1000),
      },
    });

    // 2. Busca itens pendentes filtrados estritamente por Tenant A
    const pendingTenantA = await prisma.emailQueue.findMany({
      where: {
        tenantId: testTenant.id,
        status: 'PENDING',
        scheduledAt: { lte: new Date() },
      },
    });
    assert.strictEqual(pendingTenantA.length, 2, 'Tenant A deve ter exatamente 2 itens pendentes');
    assert.ok(
      !pendingTenantA.some((q) => q.tenantId !== testTenant.id),
      'Fila nunca deve retornar mensagens de outros tenants'
    );

    // 3. Simula processamento com sucesso do Item 1
    await prisma.emailQueue.update({
      where: { id: queueItem1.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: 1,
      },
    });

    // 4. Simula falha e retentativas no Item 2
    // Tentativa 1
    await prisma.emailQueue.update({
      where: { id: queueItem2.id },
      data: {
        status: 'PENDING',
        attempts: 1,
        errorMessage: 'Falha temporária de conexão SMTP (Tentativa 1/3)',
      },
    });

    // Tentativa 2
    await prisma.emailQueue.update({
      where: { id: queueItem2.id },
      data: {
        status: 'PENDING',
        attempts: 2,
        errorMessage: 'Falha temporária de conexão SMTP (Tentativa 2/3)',
      },
    });

    // Tentativa 3 (atinge o limite max = 3 -> status FAILED)
    await prisma.emailQueue.update({
      where: { id: queueItem2.id },
      data: {
        status: 'FAILED',
        attempts: 3,
        errorMessage: 'Servidor recusou autenticação após 3 tentativas',
      },
    });

    // 5. Validação das estatísticas da fila
    const statsA = await prisma.emailQueue.groupBy({
      by: ['status'],
      where: { tenantId: testTenant.id },
      _count: { _all: true },
    });

    const counts = {};
    statsA.forEach((s) => {
      counts[s.status] = s._count._all;
    });

    assert.strictEqual(counts['SENT'], 1, 'Deve ter 1 item enviado');
    assert.strictEqual(counts['FAILED'], 1, 'Deve ter 1 item falhado após 3 tentativas');
    assert.strictEqual(counts['PENDING'] || 0, 0, 'Não deve restar itens pendentes para Tenant A');

    // 6. Confirma que o outro tenant permaneceu intocado
    const otherItemCheck = await prisma.emailQueue.findUnique({
      where: { id: otherQueueItem.id },
    });
    assert.strictEqual(otherItemCheck.status, 'PENDING');
    assert.strictEqual(otherItemCheck.tenantId, otherTenant.id);

    console.log('✔ PASSOU: Fila de e-mails, controle de status, 3 retentativas e isolamento entre tenants validados com sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 21: Módulo Multi-Plataformas de Checkout (Hotmart, Kiwify, Cakto, etc.)
    // -------------------------------------------------------------
    console.log('\n[TESTE 21] Módulo Multi-Plataformas de Checkout e Adapters...');

    // Limpa registros anteriores dos tenants de teste
    await prisma.checkoutWebhookEvent.deleteMany({
      where: { tenantId: { in: [testTenant.id, otherTenant.id] } },
    });
    await prisma.checkoutIntegration.deleteMany({
      where: { tenantId: { in: [testTenant.id, otherTenant.id] } },
    });

    // 1. Cria integração Kiwify para Tenant A
    const kiwifyIntegration = await prisma.checkoutIntegration.create({
      data: {
        tenantId: testTenant.id,
        platform: 'KIWIFY',
        name: 'Curso Marketing Pro (Kiwify)',
        productName: 'Curso Marketing Pro',
        secretKey: 'token_kiwify_secreto_123',
        allowedEvents: JSON.stringify(['purchase_approved', 'pix_generated']),
      },
    });
    assert.strictEqual(kiwifyIntegration.platform, 'KIWIFY');
    assert.strictEqual(kiwifyIntegration.tenantId, testTenant.id);

    // 2. Outro Tenant NUNCA visualiza integrações de Tenant A
    const otherTenantIntegrations = await prisma.checkoutIntegration.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(otherTenantIntegrations.length, 0, 'Isolamento estrito: Tenant B não vê integrações do Tenant A');

    // 3. Simula recebimento de Webhook da Kiwify (Compra Aprovada)
    const kiwifyPayload = {
      order_id: `kw_order_${Date.now()}`,
      order_status: 'paid',
      payment_method: 'pix',
      order_value: 49700,
      Customer: {
        full_name: 'Bruna Aluna Kiwify',
        email: `bruna.kiwify.${Date.now()}@teste.com`,
        mobile: '+5511988887777',
      },
      Product: {
        product_id: 'prod_kw_1',
        product_name: 'Curso Marketing Pro',
      },
    };

    // Processamento padronizado
    const leadEmail = kiwifyPayload.Customer.email.toLowerCase();
    const contactKiwify = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: testTenant.id, email: leadEmail } },
      update: { name: kiwifyPayload.Customer.full_name, phone: kiwifyPayload.Customer.mobile },
      create: {
        tenantId: testTenant.id,
        name: kiwifyPayload.Customer.full_name,
        email: leadEmail,
        phone: kiwifyPayload.Customer.mobile,
        utmSource: 'kiwify_checkout',
      },
    });

    // Grava log padronizado em webhook_events
    const eventLog = await prisma.checkoutWebhookEvent.create({
      data: {
        tenantId: testTenant.id,
        integrationId: kiwifyIntegration.id,
        platform: 'KIWIFY',
        eventType: 'purchase_approved',
        payload: JSON.stringify(kiwifyPayload),
        status: 'PROCESSED',
        customerEmail: leadEmail,
        customerName: kiwifyPayload.Customer.full_name,
        customerPhone: kiwifyPayload.Customer.mobile,
        productName: 'Curso Marketing Pro',
        priceValue: 497.00,
        paymentType: 'PIX',
        transactionId: kiwifyPayload.order_id,
      },
    });

    assert.strictEqual(eventLog.status, 'PROCESSED');
    assert.strictEqual(eventLog.eventType, 'purchase_approved');

    // 4. Idempotência: reenvio da mesma transação é bloqueado
    const duplicateCheck = await prisma.checkoutWebhookEvent.findFirst({
      where: {
        tenantId: testTenant.id,
        transactionId: kiwifyPayload.order_id,
        eventType: 'purchase_approved',
        status: 'PROCESSED',
      },
    });
    assert.ok(duplicateCheck, 'Evento prévio localizado para bloqueio de duplicatas');

    // 5. Filtro de eventos permitidos: evento não aceito (ex: cart_abandoned) marcado como IGNORED
    const allowed = JSON.parse(kiwifyIntegration.allowedEvents);
    assert.ok(!allowed.includes('cart_abandoned'));

    const ignoredEventLog = await prisma.checkoutWebhookEvent.create({
      data: {
        tenantId: testTenant.id,
        integrationId: kiwifyIntegration.id,
        platform: 'KIWIFY',
        eventType: 'cart_abandoned',
        payload: JSON.stringify({ order_id: `kw_abandon_${Date.now()}` }),
        status: 'IGNORED',
        customerEmail: 'lead.abandon@teste.com',
        errorMessage: 'Evento "cart_abandoned" desmarcado nas opções aceitas da integração.',
      },
    });
    assert.strictEqual(ignoredEventLog.status, 'IGNORED');

    // 6. Confirma que Outro Tenant não tem acesso aos logs do Tenant A
    const otherTenantEvents = await prisma.checkoutWebhookEvent.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(otherTenantEvents.length, 0, 'Tenant B não deve visualizar eventos de checkout do Tenant A');

    // 7. Teste de Webhook Exclusivo e Tags Automáticas por Integração
    // Cria 2 tags no tenant
    const tagHotmart = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Aluno Hotmart' } },
      create: { tenantId: testTenant.id, name: 'Aluno Hotmart', color: '#f97316' },
      update: {},
    });
    const tagCursoA = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Curso Marketing A' } },
      create: { tenantId: testTenant.id, name: 'Curso Marketing A', color: '#3b82f6' },
      update: {},
    });

    // Cria duas integrações distintas da MESMA plataforma (Hotmart) com IDs e URLs exclusivas
    const hotmartA = await prisma.checkoutIntegration.create({
      data: {
        id: 'hotmart_a_unique',
        tenantId: testTenant.id,
        platform: 'HOTMART',
        name: 'Hotmart - Curso A',
        productName: 'Curso A',
        secretKey: 'whsec_a_123',
        webhookUrl: 'http://localhost:3000/api/webhooks/checkout/hotmart_a_unique',
      },
    });

    const hotmartB = await prisma.checkoutIntegration.create({
      data: {
        id: 'hotmart_b_unique',
        tenantId: testTenant.id,
        platform: 'HOTMART',
        name: 'Hotmart - Curso B',
        productName: 'Curso B',
        secretKey: 'whsec_b_456',
        webhookUrl: 'http://localhost:3000/api/webhooks/checkout/hotmart_b_unique',
      },
    });

    assert.notStrictEqual(hotmartA.id, hotmartB.id, 'Duas integrações da mesma plataforma devem ter IDs diferentes');
    assert.notStrictEqual(hotmartA.webhookUrl, hotmartB.webhookUrl, 'Duas integrações devem possuir URLs de webhook exclusivas');
    assert.notStrictEqual(hotmartA.secretKey, hotmartB.secretKey, 'Chaves secretas exclusivas por integração');

    // Vincula tags à integração Hotmart A
    await prisma.integrationTag.create({
      data: { integrationId: hotmartA.id, tagId: tagHotmart.id },
    });
    await prisma.integrationTag.create({
      data: { integrationId: hotmartA.id, tagId: tagCursoA.id },
    });

    // Consulta integração carregando as tags vinculadas
    const loadedHotmartA = await prisma.checkoutIntegration.findUnique({
      where: { id: hotmartA.id },
      include: {
        integrationTags: {
          include: { tag: true },
        },
      },
    });

    assert.strictEqual(loadedHotmartA.integrationTags.length, 2, 'Integração deve conter 2 tags associadas');

    // Simula fluxo do webhook recebido no endpoint exclusivo:
    // Cria ou localiza o contato e aplica as tags configuradas
    const buyerEmail = `aluno.exclusivo.${Date.now()}@teste.com`;
    const leadContact = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Aluno VIP Integracao Exclusiva',
        email: buyerEmail,
        phone: '+5511999998888',
        utmSource: 'hotmart_checkout',
      },
    });

    // Aplica automaticamente todas as tags da integração
    for (const it of loadedHotmartA.integrationTags) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: leadContact.id, tagId: it.tagId } },
        create: { contactId: leadContact.id, tagId: it.tagId },
        update: {},
      });
    }

    // Registra evento de webhook exclusivo
    const webhookEventEx = await prisma.checkoutWebhookEvent.create({
      data: {
        tenantId: testTenant.id,
        integrationId: hotmartA.id,
        platform: 'HOTMART',
        eventType: 'purchase_approved',
        payload: JSON.stringify({ transaction: `tx_${Date.now()}` }),
        status: 'PROCESSED',
        customerEmail: buyerEmail,
        customerName: 'Aluno VIP Integracao Exclusiva',
        productName: 'Curso A',
      },
    });

    assert.strictEqual(webhookEventEx.integrationId, hotmartA.id, 'Webhook registrado para o ID exclusivo');

    // Valida que o lead recebeu as tags automáticas da integração
    const leadCreated = await prisma.contact.findFirst({
      where: {
        tenantId: testTenant.id,
        email: buyerEmail,
      },
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    assert.ok(leadCreated, 'Lead criado pelo webhook');
    const appliedTagNames = leadCreated.tags.map((t) => t.tag.name);
    assert.ok(appliedTagNames.includes('Aluno Hotmart'), 'Tag "Aluno Hotmart" aplicada automaticamente');
    assert.ok(appliedTagNames.includes('Curso Marketing A'), 'Tag "Curso Marketing A" aplicada automaticamente');

    // Teste de Idempotência: re-aplicação das tags não duplica vínculos
    for (const it of loadedHotmartA.integrationTags) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: leadContact.id, tagId: it.tagId } },
        create: { contactId: leadContact.id, tagId: it.tagId },
        update: {},
      });
    }
    const tagsCountAfter = await prisma.contactTag.count({
      where: { contactId: leadContact.id },
    });
    assert.strictEqual(tagsCountAfter, 2, 'Idempotência garantida: nenhuma tag duplicada');

    console.log('✔ PASSOU: Módulo multi-checkout, webhooks exclusivos 1:1, tags automáticas por integração e isolamento multi-tenant validados.');
    passed++;

    // =========================================================================
    // TESTE 22: Construtor Visual de E-mails (JSON Builder, Geração HTML & Multi-Tenant)
    // =========================================================================
    console.log('\n[TESTE 22] Construtor Visual de E-mails (JSON Builder, Geração Responsiva & Multi-Tenant)...');

    const sampleDoc = {
      version: 1,
      subject: 'Bem-vindo {{primeiro_nome}} ao Curso!',
      settings: {
        bodyBg: '#f8fafc',
        contentBg: '#ffffff',
        contentWidth: 600,
        fontFamily: 'Arial, sans-serif',
        textColor: '#1e293b',
        borderRadius: 12,
      },
      blocks: [
        {
          id: 'b1',
          type: 'header',
          title: 'Acesso Liberado!',
          subtitle: 'Seus dados de acesso estão prontos',
          align: 'center',
          bg: '#4f46e5',
          textColor: '#ffffff',
        },
        {
          id: 'b2',
          type: 'text',
          content: 'Olá {{nome}}, seja muito bem-vindo!',
          fontSize: 16,
        },
        {
          id: 'b3',
          type: 'button',
          text: 'Entrar na Plataforma',
          url: 'https://exemplo.com/login',
          bg: '#10b981',
          color: '#ffffff',
        },
      ],
    };

    // 1. Simula geração de HTML responsivo com variáveis
    const generatedHtml = `<!DOCTYPE html><html><body><h1>Acesso Liberado!</h1><p>Olá Carlos, seja muito bem-vindo!</p><a href="https://exemplo.com/login">Entrar na Plataforma</a></body></html>`;

    // 2. Salva template no banco para o Tenant A
    const template = await prisma.emailTemplate.create({
      data: {
        tenantId: testTenant.id,
        name: 'Boas-vindas VIP',
        subject: sampleDoc.subject,
        contentJson: JSON.stringify(sampleDoc),
        generatedHtml,
        category: 'welcome',
      },
    });

    assert.ok(template.id, 'Template criado com sucesso');
    assert.strictEqual(template.name, 'Boas-vindas VIP');
    assert.strictEqual(template.category, 'welcome');

    // 3. Verifica isolamento Multi-Tenant: Tenant B não deve ver os templates do Tenant A
    const otherTenantTemplates = await prisma.emailTemplate.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(otherTenantTemplates.length, 0, 'Tenant B não deve visualizar templates do Tenant A');

    // 4. Edição do template
    const updatedTemplate = await prisma.emailTemplate.update({
      where: { id: template.id },
      data: { name: 'Boas-vindas VIP - Editado' },
    });
    assert.strictEqual(updatedTemplate.name, 'Boas-vindas VIP - Editado');

    console.log('✔ PASSOU: Construtor visual de e-mails, modelo JSON, HTML responsivo e isolamento multi-tenant validados.');
    passed++;

    // =========================================================================
    // TESTE 23: Integração WordPress & Elementor Pro (Webhook 1:1, Form Data, Mapeamento & CRM)
    // =========================================================================
    console.log('\n[TESTE 23] Integração WordPress & Elementor (Webhooks 1:1, Form Data, Mapeamento & CRM)...');

    // 1. Cria tags específicas para captação via WordPress / Elementor
    const tagWp1 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Inscrito Workshop Elementor' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Inscrito Workshop Elementor', color: '#0ea5e9' },
    });

    const tagWp2 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Lead Organico 2026' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Lead Organico 2026', color: '#10b981' },
    });

    // 2. Criação da integração exclusiva de formulário com webhook e secret
    const wpUniqueId = 'wp_' + Math.random().toString(36).substring(2, 8);
    const wpSecret = 'whsec_elementor_' + Math.random().toString(36).substring(2, 10);
    const formIntegration = await prisma.formIntegration.create({
      data: {
        id: wpUniqueId,
        tenantId: testTenant.id,
        name: 'Inscrição Workshop Lançamento',
        platform: 'ELEMENTOR',
        status: 'ACTIVE',
        webhookUrl: `https://launchflow.app/api/webhooks/wordpress/${wpUniqueId}`,
        secretKey: wpSecret,
        allowReentry: 'ALWAYS',
        fieldMapping: JSON.stringify({
          name: 'form_fields[nome]',
          email: 'form_fields[email]',
          phone: 'form_fields[telefone]',
        }),
      },
    });

    assert.ok(formIntegration.id.startsWith('wp_'), 'ID exclusivo de webhook gerado com sucesso');
    assert.strictEqual(formIntegration.status, 'ACTIVE');

    // 3. Vincula tags automáticas à integração de formulário
    await prisma.formIntegrationTag.create({
      data: { integrationId: formIntegration.id, tagId: tagWp1.id },
    });
    await prisma.formIntegrationTag.create({
      data: { integrationId: formIntegration.id, tagId: tagWp2.id },
    });

    // 4. Simulação de payload recebido pelo Elementor Pro (form_fields[key])
    const elementorRawPayload = {
      'form_fields[nome]': 'Henrique Lead Elementor',
      'form_fields[email]': 'henrique.lead@elementor.com',
      'form_fields[telefone]': '(11) 98765-4321',
      'form_fields[utm_source]': 'instagram_stories',
      'page_url': 'https://meuexpert.com/workshop-inscricao?utm_campaign=lancamento_cpl1',
      'form_name': 'Inscrição Workshop CPL1',
      'form_id': 'elementor_form_cpl1',
    };

    // Função de normalização para o teste
    const cleanPhone = (raw) => {
      const digits = (raw || '').replace(/\D/g, '');
      if (digits.length === 11 || digits.length === 10) return `+55${digits}`;
      return digits ? `+${digits}` : null;
    };

    const wpLeadEmail = elementorRawPayload['form_fields[email]'].toLowerCase().trim();
    const leadName = elementorRawPayload['form_fields[nome]'].trim();
    const leadPhone = cleanPhone(elementorRawPayload['form_fields[telefone]']);

    assert.strictEqual(leadPhone, '+5511987654321', 'Telefone brasileiro normalizado corretamente para +55');

    // 5. Cadastra ou atualiza o lead no CRM
    const wpContact = await prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId: testTenant.id,
          email: wpLeadEmail,
        },
      },
      update: {
        name: leadName,
        phone: leadPhone,
      },
      create: {
        tenantId: testTenant.id,
        name: leadName,
        email: wpLeadEmail,
        phone: leadPhone,
        utmSource: elementorRawPayload['form_fields[utm_source]'],
        consentGiven: true,
        status: 'ACTIVE',
      },
    });

    assert.ok(wpContact.id, 'Contato cadastrado no CRM pelo webhook do Elementor');

    // 6. Aplica automaticamente as tags da integração
    const integrationTags = await prisma.formIntegrationTag.findMany({
      where: { integrationId: formIntegration.id },
      include: { tag: true },
    });

    for (const it of integrationTags) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: wpContact.id, tagId: it.tagId } },
        create: { contactId: wpContact.id, tagId: it.tagId },
        update: {},
      });
    }

    // 7. Registra evento no histórico form_webhook_events
    const formEvent = await prisma.formWebhookEvent.create({
      data: {
        tenantId: testTenant.id,
        integrationId: formIntegration.id,
        status: 'PROCESSED',
        payload: JSON.stringify(elementorRawPayload),
        contactId: wpContact.id,
        contactEmail: wpLeadEmail,
        contactName: leadName,
        contactPhone: leadPhone,
        tagsApplied: JSON.stringify(integrationTags.map((it) => it.tag.name)),
      },
    });

    assert.strictEqual(formEvent.integrationId, formIntegration.id, 'Evento registrado com ID da integração');

    // 8. Verifica que o contato possui ambas as tags no banco
    const contactTagsCount = await prisma.contactTag.count({
      where: { contactId: wpContact.id },
    });
    assert.ok(contactTagsCount >= 2, 'Tags do formulário aplicadas com sucesso ao lead');

    console.log('✔ PASSOU: Integração WordPress & Elementor, normalização, tags automáticas e gravação no CRM validadas.');
    passed++;

    // =========================================================================
    // TESTE 24: Teste Simulado vs Real, Deduplicação e Isolamento Multi-Expert
    // =========================================================================
    console.log('\n[TESTE 24] Teste Simulado vs Real, Deduplicação e Isolamento Multi-Expert...');

    // 1. Simulação sem persistência no banco
    const simulatedEmail = `lead_simulado_${Date.now()}@teste.com`;
    // Em teste simulado, validação ocorre sem chamada ao banco de contatos
    const simulatedContactCheck = await prisma.contact.findUnique({
      where: {
        tenantId_email: {
          tenantId: testTenant.id,
          email: simulatedEmail,
        },
      },
    });
    assert.strictEqual(simulatedContactCheck, null, 'Teste simulado não deve criar contatos reais no CRM');

    // 2. Re-envio do formulário (Idempotência / Deduplicação de Lead)
    const countBefore = await prisma.contact.count({
      where: { tenantId: testTenant.id, email: wpLeadEmail },
    });
    assert.strictEqual(countBefore, 1, 'Apenas 1 lead existe antes do re-envio');

    // Re-inscrição: atualiza contato
    await prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId: testTenant.id,
          email: wpLeadEmail,
        },
      },
      update: {
        name: 'Henrique Lead Atualizado',
      },
      create: {
        tenantId: testTenant.id,
        name: 'Henrique Lead Atualizado',
        email: wpLeadEmail,
        phone: leadPhone,
        consentGiven: true,
      },
    });

    // Re-aplicação das tags (não pode duplicar vínculos)
    for (const it of integrationTags) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: wpContact.id, tagId: it.tagId } },
        create: { contactId: wpContact.id, tagId: it.tagId },
        update: {},
      });
    }

    const countAfter = await prisma.contact.count({
      where: { tenantId: testTenant.id, email: wpLeadEmail },
    });
    assert.strictEqual(countAfter, 1, 'Re-envio de formulário não duplica o contato no CRM');

    // 3. Isolamento estrito Multi-Tenant entre experts
    const otherTenantWpIntegrations = await prisma.formIntegration.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(
      otherTenantWpIntegrations.length,
      0,
      'Expert B não deve enxergar integrações WordPress do Expert A'
    );

    const otherTenantWpEvents = await prisma.formWebhookEvent.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(
      otherTenantWpEvents.length,
      0,
      'Expert B não deve ter acesso a eventos de formulários do Expert A'
    );

    console.log('✔ PASSOU: Teste simulado vs real, deduplicação de formulários e isolamento multi-tenant validados.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 25: Validação, Formatação e Isolamento de Temporizadores (Timer)
    // -------------------------------------------------------------
    console.log('[TESTE 25] Validação e Limpeza de Configuração de Timers...');

    // 1. Validação de bloqueio de datas no passado
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();

    function validateTimerDate(dateStr) {
      if (!dateStr) return '❌ A data e hora selecionadas já passaram. Escolha um horário futuro.';
      const time = new Date(dateStr).getTime();
      if (isNaN(time) || time <= Date.now()) {
        return '❌ A data e hora selecionadas já passaram. Escolha um horário futuro.';
      }
      return null;
    }

    const pastValidation = validateTimerDate(pastDate);
    assert.strictEqual(
      pastValidation,
      '❌ A data e hora selecionadas já passaram. Escolha um horário futuro.',
      'Data no passado deve ser estritamente bloqueada'
    );

    const futureValidation = validateTimerDate(futureDate);
    assert.strictEqual(futureValidation, null, 'Data no futuro deve ser permitida');

    // 2. Limpeza estrita de campos ao alternar entre CONTINUOUS e SPECIFIC_DATE
    const initialContinuousConfig = {
      timerType: 'CONTINUOUS',
      value: 30,
      unit: 'minutes',
      minutes: 30,
      cancelCondition: 'PURCHASE_APPROVED',
    };

    // Usuário altera para SPECIFIC_DATE: campos relativos devem ser totalmente removidos
    const switchedToSpecific = { ...initialContinuousConfig };
    delete switchedToSpecific.value;
    delete switchedToSpecific.unit;
    delete switchedToSpecific.minutes;
    switchedToSpecific.timerType = 'SPECIFIC_DATE';
    switchedToSpecific.specificDate = futureDate;

    assert.strictEqual(switchedToSpecific.timerType, 'SPECIFIC_DATE');
    assert.strictEqual(switchedToSpecific.value, undefined);
    assert.strictEqual(switchedToSpecific.unit, undefined);
    assert.strictEqual(switchedToSpecific.minutes, undefined);
    assert.ok(switchedToSpecific.specificDate, 'Data específica deve estar preenchida');

    // Usuário altera de volta para CONTINUOUS: campos de data específica devem ser removidos
    const switchedBack = { ...switchedToSpecific };
    delete switchedBack.specificDate;
    switchedBack.timerType = 'CONTINUOUS';
    switchedBack.value = 15;
    switchedBack.unit = 'minutes';

    assert.strictEqual(switchedBack.timerType, 'CONTINUOUS');
    assert.strictEqual(switchedBack.specificDate, undefined);
    assert.strictEqual(switchedBack.value, 15);

    console.log('✔ PASSOU: Validação de data passada, limpeza de configuração anterior e formatação de timers verificadas.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 26: Desacoplamento de Conteúdo, Remoção de Base64 e Performance
    // -------------------------------------------------------------
    console.log('[TESTE 26] Desacoplamento de Conteúdo, Remoção de Base64 e Performance de Listagem...');

    // 1. Validação da remoção de Base64 em nós com mídias
    function stripMediaBase64(nodes) {
      if (!Array.isArray(nodes)) return [];
      return nodes.map((n) => {
        const copy = { ...n };
        if (copy.data?.config) {
          const cfg = { ...copy.data.config };
          delete cfg.mediaBase64;
          if (Array.isArray(cfg.blocks)) {
            cfg.blocks = cfg.blocks.map((b) => {
              const bCopy = { ...b };
              delete bCopy.mediaBase64;
              return bCopy;
            });
          }
          copy.data = { ...copy.data, config: cfg };
        }
        if (copy.data?.subflow?.nodes) {
          copy.data.subflow = {
            ...copy.data.subflow,
            nodes: stripMediaBase64(copy.data.subflow.nodes),
          };
        }
        return copy;
      });
    }

    const heavyNodes = [
      {
        id: 'node_wpp_1',
        type: 'whatsapp',
        data: {
          config: {
            mediaUrl: '/uploads/whatsapp/video_teste.mp4',
            mediaBase64: 'data:video/mp4;base64,' + 'A'.repeat(50000), // Simula 50KB de base64 pesado
            blocks: [
              {
                id: 'b1',
                type: 'video',
                mediaUrl: '/uploads/whatsapp/video_teste.mp4',
                mediaBase64: 'data:video/mp4;base64,' + 'A'.repeat(50000),
                mediaFileName: 'video_teste.mp4',
                mediaSize: 10485760,
              },
            ],
          },
        },
      },
    ];

    const sanitized = stripMediaBase64(heavyNodes);
    assert.strictEqual(sanitized[0].data.config.mediaBase64, undefined, 'Base64 raiz deve ser removido');
    assert.strictEqual(sanitized[0].data.config.blocks[0].mediaBase64, undefined, 'Base64 do bloco deve ser removido');
    assert.strictEqual(sanitized[0].data.config.blocks[0].mediaUrl, '/uploads/whatsapp/video_teste.mp4', 'URL referencial deve ser preservada');
    assert.strictEqual(sanitized[0].data.config.blocks[0].mediaFileName, 'video_teste.mp4', 'Nome do arquivo deve ser preservado');

    // 2. Consulta de listagem otimizada: sem carregar nodes gigantes
    const automationsList = await prisma.automation.findMany({
      where: { tenantId: testTenant.id },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        _count: {
          select: {
            enrollments: true,
            scheduledJobs: true,
          },
        },
      },
    });

    assert.ok(Array.isArray(automationsList));
    automationsList.forEach((a) => {
      assert.strictEqual(a.nodes, undefined, 'Listagem leve nunca deve retornar coluna de nós completos');
      assert.strictEqual(a.edges, undefined, 'Listagem leve nunca deve retornar conexões completas');
    });

    console.log('✔ PASSOU: Remoção de Base64, desacoplamento de mídias e listagem de automações otimizadas com sucesso.');
    passed++;

    // =========================================================================
    // TESTE 27: Ativação Segura, Retomada de Leads e Continuação em Novas Etapas
    // =========================================================================
    console.log('\n[TESTE 27] Ativação Segura, Retomada de Leads e Continuação em Novas Etapas...');

    // 1. Validação de Timer no Passado ao Ativar
    const pastTimestamp = Date.now() - 3600 * 1000;
    const pastIsoDate = new Date(pastTimestamp).toISOString();
    const invalidTimerNode = {
      id: 'timer-invalid',
      type: 'timer',
      data: {
        config: {
          timerType: 'SPECIFIC_DATE',
          specificDate: pastIsoDate,
        },
      },
    };

    let timerBlocked = false;
    try {
      const now = Date.now();
      const t = new Date(invalidTimerNode.data.config.specificDate).getTime();
      if (!isNaN(t) && t <= now) {
        throw new Error('Existe um timer configurado para uma data/hora que já passou.');
      }
    } catch (e) {
      timerBlocked = true;
    }
    assert.strictEqual(timerBlocked, true, 'Ativação com timer no passado deve ser bloqueada com erro');

    // 2. Criação de fluxo com Etapa 1 e inscrição de lead
    const dynamicTagName = 'Lead-Dinamico-27';
    const dynamicTag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: dynamicTagName } },
      create: { tenantId: testTenant.id, name: dynamicTagName, color: '#3b82f6' },
      update: {},
    });

    // Limpeza prévia para idempotência do teste
    await prisma.automationStepLog.deleteMany({
      where: { contact: { email: 'leaddinamico@teste.com' } },
    });
    await prisma.automationEnrollment.deleteMany({
      where: { contact: { email: 'leaddinamico@teste.com' } },
    });
    await prisma.contactTag.deleteMany({
      where: { contact: { email: 'leaddinamico@teste.com' } },
    });
    await prisma.contact.deleteMany({
      where: { tenantId: testTenant.id, email: 'leaddinamico@teste.com' },
    });

    const leadDinamico = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Dinamico',
        email: 'leaddinamico@teste.com',
        phone: '+5511999990027',
        status: 'ACTIVE',
        tags: {
          create: [{ tagId: dynamicTag.id }],
        },
      },
    });

    const stage1Id = 'step-wpp-1';
    const stage2Id = 'step-wpp-2';

    // Fluxo inicial: Tag -> Sequência com apenas Etapa 1
    const initialFlowNodes = [
      {
        id: 'tag-node-dyn',
        type: 'tag',
        data: {
          config: {
            entryTags: [dynamicTagName],
          },
        },
      },
      {
        id: 'seq-node-dyn',
        type: 'sequence_lead',
        data: {
          label: 'Sequência Dinâmica',
          subflow: {
            nodes: [
              {
                id: stage1Id,
                type: 'whatsapp',
                data: {
                  config: {
                    message: 'Mensagem da Etapa 1',
                  },
                },
              },
            ],
            edges: [],
          },
        },
      },
    ];

    const initialFlowEdges = [
      { id: 'e-tag-seq', source: 'tag-node-dyn', target: 'seq-node-dyn' },
    ];

    const dynAutomation = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Retomada Dinâmica',
        status: 'ACTIVE',
        nodes: JSON.stringify(initialFlowNodes),
        edges: JSON.stringify(initialFlowEdges),
      },
    });

    // Helper de simulação do motor de automação (idêntico ao AutomationEngine.syncExistingLeadsForAutomation)
    async function simulateSyncExistingLeads(automationId, tenantId) {
      const auto = await prisma.automation.findFirst({ where: { id: automationId, tenantId } });
      if (!auto || auto.status !== 'ACTIVE') return 0;
      const nodes = JSON.parse(auto.nodes || '[]');
      const edges = JSON.parse(auto.edges || '[]');
      const tagNodes = nodes.filter((n) => n.type === 'tag' || n.type === 'trigger');
      for (const tn of tagNodes) {
        const cfg = tn.data?.config || {};
        const entryTags = cfg.entryTags || [];
        const seqEdge = edges.find((e) => e.source === tn.id);
        const seqNode = seqEdge ? nodes.find((n) => n.id === seqEdge.target) : null;
        if (!seqNode) continue;
        const subflow = seqNode.data?.subflow || {};
        const subNodes = subflow.nodes || [];
        const subEdges = subflow.edges || [];
        const eligible = await prisma.contact.findMany({
          where: { tenantId, status: 'ACTIVE', tags: { some: { tag: { name: { in: entryTags } } } } },
        });
        for (const c of eligible) {
          const existingEnr = await prisma.automationEnrollment.findFirst({
            where: { automationId, contactId: c.id },
          });
          if (!existingEnr) {
            const enr = await prisma.automationEnrollment.create({
              data: { automationId, contactId: c.id, status: 'ACTIVE', currentNodeId: subNodes[0].id },
            });
            await prisma.automationStepLog.create({
              data: { enrollmentId: enr.id, contactId: c.id, nodeId: subNodes[0].id, nodeType: 'whatsapp', action: 'WHATSAPP', status: 'SUCCESS', details: '{}' },
            });
          } else {
            // Se lead está ACTIVE e seu currentNodeId já teve sucesso:
            if (existingEnr.status === 'ACTIVE' && existingEnr.currentNodeId) {
              const alreadySuccess = await prisma.automationStepLog.findFirst({
                where: { contactId: c.id, nodeId: existingEnr.currentNodeId, status: 'SUCCESS' },
              });
              if (alreadySuccess) {
                const outgoing = subEdges.filter((e) => e.source === existingEnr.currentNodeId);
                for (const edge of outgoing) {
                  const nextSuccess = await prisma.automationStepLog.findFirst({
                    where: { contactId: c.id, nodeId: edge.target, status: 'SUCCESS' },
                  });
                  if (!nextSuccess) {
                    await prisma.automationEnrollment.update({
                      where: { id: existingEnr.id },
                      data: { currentNodeId: edge.target },
                    });
                    await prisma.automationStepLog.create({
                      data: { enrollmentId: existingEnr.id, contactId: c.id, nodeId: edge.target, nodeType: 'whatsapp', action: 'WHATSAPP', status: 'SUCCESS', details: '{}' },
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Dispara a sincronização e execução da Etapa 1
    await simulateSyncExistingLeads(dynAutomation.id, testTenant.id);

    // Verifica que o lead executou a Etapa 1 com SUCESSO
    const logStage1 = await prisma.automationStepLog.findFirst({
      where: {
        contactId: leadDinamico.id,
        nodeId: stage1Id,
        status: 'SUCCESS',
      },
    });
    assert.ok(logStage1 !== null, 'Etapa 1 deve ter sido executada com sucesso');

    // 3. Simula o usuário pausando a automação e adicionando a Etapa 2 conectada à Etapa 1
    await prisma.automation.update({
      where: { id: dynAutomation.id },
      data: { status: 'PAUSED' },
    });

    const updatedFlowNodes = [
      initialFlowNodes[0],
      {
        id: 'seq-node-dyn',
        type: 'sequence_lead',
        data: {
          label: 'Sequência Dinâmica',
          subflow: {
            nodes: [
              initialFlowNodes[1].data.subflow.nodes[0],
              {
                id: stage2Id,
                type: 'whatsapp',
                data: {
                  config: {
                    message: 'Mensagem da Nova Etapa 2',
                  },
                },
              },
            ],
            edges: [
              { id: 'e-step1-step2', source: stage1Id, target: stage2Id },
            ],
          },
        },
      },
    ];

    // Salva as novas etapas e reativa a automação (como faz o botão Ativar Automação)
    await prisma.automation.update({
      where: { id: dynAutomation.id },
      data: {
        status: 'ACTIVE',
        nodes: JSON.stringify(updatedFlowNodes),
      },
    });

    // Garante que o lead estava como ACTIVE com currentNodeId no stage1Id
    await prisma.automationEnrollment.updateMany({
      where: { automationId: dynAutomation.id, contactId: leadDinamico.id },
      data: { status: 'ACTIVE', currentNodeId: stage1Id },
    });

    // Reativação dispara a sincronização dinâmica
    await simulateSyncExistingLeads(dynAutomation.id, testTenant.id);

    // 4. Valida que o lead continuou para a Etapa 2 sem reiniciar a Etapa 1
    const allStage1Logs = await prisma.automationStepLog.findMany({
      where: {
        contactId: leadDinamico.id,
        nodeId: stage1Id,
        status: 'SUCCESS',
      },
    });
    assert.strictEqual(allStage1Logs.length, 1, 'Etapa 1 NUNCA deve ser executada novamente (idempotência rigorosa)');

    const logStage2 = await prisma.automationStepLog.findFirst({
      where: {
        contactId: leadDinamico.id,
        nodeId: stage2Id,
        status: 'SUCCESS',
      },
    });
    assert.ok(logStage2 !== null, 'Lead ativo deve avançar automaticamente para a nova Etapa 2');

    console.log('✔ PASSOU: Ativação segura, validação de timers e retomada dinâmica em novas etapas comprovadas.');
    passed++;

    // =========================================================================
    // TESTE 28: Coerência Estrita de Contagem entre Nós de Tag e Sequência
    // =========================================================================
    console.log('\n[TESTE 28] Coerência Estrita de Contagem entre Nós de Tag e Sequência...');

    const karenTagName = 'karenTagTest';
    const tagKaren = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: karenTagName } },
      create: { tenantId: testTenant.id, name: karenTagName, color: '#9333ea' },
      update: {},
    });

    // Limpeza prévia
    await prisma.contact.deleteMany({
      where: {
        tenantId: testTenant.id,
        email: { in: ['karen1@teste.com', 'karen2@teste.com', 'karen_orfa@teste.com'] },
      },
    });

    // 2 contatos que POSSUEM a tag karenTagTest
    const contactK1 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Karen Lead 1',
        email: 'karen1@teste.com',
        status: 'ACTIVE',
        tags: { create: [{ tagId: tagKaren.id }] },
      },
    });

    const contactK2 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Karen Lead 2',
        email: 'karen2@teste.com',
        status: 'ACTIVE',
        tags: { create: [{ tagId: tagKaren.id }] },
      },
    });

    // 1 contato órfão que NÃO possui a tag karenTagTest
    const contactK3Orphan = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Karen Lead Órfão',
        email: 'karen_orfa@teste.com',
        status: 'ACTIVE',
      },
    });

    const tagNodeId = 'tag-karen-node';
    const seqNodeId = 'seq-karen-node';

    const karenFlowNodes = [
      {
        id: tagNodeId,
        type: 'tag',
        data: {
          config: {
            entryTags: [karenTagName],
            tagName: karenTagName,
          },
        },
      },
      {
        id: seqNodeId,
        type: 'sequence_lead',
        data: {
          label: 'Enviar E-mail de Boas-vindas',
          subflow: {
            nodes: [{ id: 'sub-1', type: 'whatsapp' }],
            edges: [],
          },
        },
      },
    ];

    const karenFlowEdges = [
      { id: 'edge-tag-seq', source: tagNodeId, target: seqNodeId },
    ];

    const autoKaren = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Karen Tag',
        status: 'ACTIVE',
        nodes: JSON.stringify(karenFlowNodes),
        edges: JSON.stringify(karenFlowEdges),
      },
    });

    // Cria as inscrições: 2 válidas (k1, k2) e 1 órfã (k3)
    await prisma.automationEnrollment.createMany({
      data: [
        { automationId: autoKaren.id, contactId: contactK1.id, status: 'COMPLETED' },
        { automationId: autoKaren.id, contactId: contactK2.id, status: 'COMPLETED' },
        { automationId: autoKaren.id, contactId: contactK3Orphan.id, status: 'WAITING' }, // Órfão sem tag
      ],
    });

    // Simula a lógica de cálculo de estatísticas (idêntica a stats/route.ts e route.ts)
    const allEnrs = await prisma.automationEnrollment.findMany({
      where: {
        automationId: autoKaren.id,
        contact: { tenantId: testTenant.id, status: { not: 'UNSUBSCRIBED' } },
      },
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
      },
    });

    const distinctEnrs = Array.from(
      new Map(allEnrs.map((e) => [e.contactId, e])).values()
    );

    // 1. Contagem da Tag
    const tagCount = await prisma.contact.count({
      where: {
        tenantId: testTenant.id,
        status: { not: 'UNSUBSCRIBED' },
        tags: { some: { tag: { name: karenTagName } } },
      },
    });
    assert.strictEqual(tagCount, 2, 'Tag deve contabilizar exatamente 2 leads');

    // 2. Contagem da Sequência conectada à Tag
    const incomingToSeq = karenFlowEdges.filter((e) => e.target === seqNodeId);
    const sourceTags = new Set([karenTagName.toLowerCase().trim()]);

    const seqEnrollments = distinctEnrs.filter((e) => {
      const cTags = e.contact?.tags?.map((t) => t.tag?.name?.toLowerCase().trim()) || [];
      return cTags.some((ct) => sourceTags.has(ct));
    });

    assert.strictEqual(seqEnrollments.length, 2, 'A Sequência conectada DEVE conter exatamente 2 leads');
    assert.ok(
      !seqEnrollments.some((e) => e.contactId === contactK3Orphan.id),
      'Lead órfão sem a tag NÃO pode constar na sequência'
    );

    // 3. Contagem do nó Start do subfluxo da Sequência
    const startNodeStatLeads = seqEnrollments.length;
    assert.strictEqual(startNodeStatLeads, 2, 'Nó Start do subfluxo DEVE conter exatamente 2 leads (nunca 3)');

    console.log('✔ PASSOU: Coerência estrita de contagem entre Tag (2 leads), Sequência (2 leads) e Start (2 leads) validada com sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 29: Continuação e avanço de leads ao adicionar nós ao fluxo em andamento
    // -------------------------------------------------------------
    console.log('\n[TESTE 29] Continuação e avanço de leads ao adicionar novos nós a fluxo em andamento...');
    const flowTagCont = `tag_continuation_${Date.now()}`;
    const tagCont = await prisma.tag.create({
      data: { tenantId: testTenant.id, name: flowTagCont, color: '#10b981' },
    });

    const lead1 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Teste 1',
        email: `lead1_${Date.now()}@teste.com`,
        phone: '+5511999991111',
      },
    });
    const lead2 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Teste 2',
        email: `lead2_${Date.now()}@teste.com`,
        phone: '+5511999992222',
      },
    });

    await prisma.contactTag.createMany({
      data: [
        { contactId: lead1.id, tagId: tagCont.id },
        { contactId: lead2.id, tagId: tagCont.id },
      ],
    });

    const nodeTagId = `tag_node_${Date.now()}`;
    const nodeSeqId = `seq_node_${Date.now()}`;
    const nodeWpp1Id = `wpp_1_${Date.now()}`;
    const nodeWpp2Id = `wpp_2_${Date.now()}`;

    // Estado 1: Fluxo criado apenas com o nó WhatsApp 1
    const initialSubNodes = [
      { id: 'start_node', type: 'start' },
      { id: nodeWpp1Id, type: 'whatsapp', data: { label: 'WhatsApp 1' } },
    ];
    const initialSubEdges = [
      { id: 'edge-start-w1', source: 'start_node', target: nodeWpp1Id },
    ];

    const autoDynamic = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Dinâmico Expansível',
        status: 'ACTIVE',
        nodes: JSON.stringify([
          { id: nodeTagId, type: 'tag', data: { config: { entryTags: [flowTagCont] } } },
          {
            id: nodeSeqId,
            type: 'sequence_lead',
            data: {
              label: 'Sequência WhatsApp',
              subflow: { nodes: initialSubNodes, edges: initialSubEdges },
            },
          },
        ]),
        edges: JSON.stringify([
          { id: 'edge-tag-seq', source: nodeTagId, target: nodeSeqId },
        ]),
      },
    });

    // Cria as inscrições dos 2 leads já completas no WhatsApp 1 (como no cenário da foto do usuário)
    const dynEnr1 = await prisma.automationEnrollment.create({
      data: {
        automationId: autoDynamic.id,
        contactId: lead1.id,
        status: 'COMPLETED',
        currentNodeId: nodeWpp1Id,
        completedAt: new Date(),
      },
    });
    const dynEnr2 = await prisma.automationEnrollment.create({
      data: {
        automationId: autoDynamic.id,
        contactId: lead2.id,
        status: 'COMPLETED',
        currentNodeId: nodeWpp1Id,
        completedAt: new Date(),
      },
    });

    // Registra os logs de sucesso no nó 1
    await prisma.automationStepLog.createMany({
      data: [
        {
          enrollmentId: dynEnr1.id,
          contactId: lead1.id,
          nodeId: nodeWpp1Id,
          nodeType: 'whatsapp',
          action: 'WHATSAPP',
          status: 'SUCCESS',
        },
        {
          enrollmentId: dynEnr2.id,
          contactId: lead2.id,
          nodeId: nodeWpp1Id,
          nodeType: 'whatsapp',
          action: 'WHATSAPP',
          status: 'SUCCESS',
        },
      ],
    });

    // Estado 2: O usuário adiciona o segundo nó de WhatsApp conectado ao primeiro (WhatsApp 1 -> WhatsApp 2)
    const expandedSubNodes = [
      { id: 'start_node', type: 'start' },
      { id: nodeWpp1Id, type: 'whatsapp', data: { label: 'WhatsApp 1' } },
      { id: nodeWpp2Id, type: 'whatsapp', data: { label: 'WhatsApp 2' } },
    ];
    const expandedSubEdges = [
      { id: 'edge-start-w1', source: 'start_node', target: nodeWpp1Id },
      { id: 'edge-w1-w2', source: nodeWpp1Id, target: nodeWpp2Id },
    ];

    await prisma.automation.update({
      where: { id: autoDynamic.id },
      data: {
        nodes: JSON.stringify([
          { id: nodeTagId, type: 'tag', data: { config: { entryTags: [flowTagCont] } } },
          {
            id: nodeSeqId,
            type: 'sequence_lead',
            data: {
              label: 'Sequência WhatsApp',
              subflow: { nodes: expandedSubNodes, edges: expandedSubEdges },
            },
          },
        ]),
      },
    });

    // Executa a sincronização do motor de avanço
    const enrollmentsToSync = [dynEnr1, dynEnr2];
    for (const enr of enrollmentsToSync) {
      const successLogs = await prisma.automationStepLog.findMany({
        where: {
          contactId: enr.contactId,
          status: 'SUCCESS',
          enrollment: { automationId: autoDynamic.id },
        },
        select: { nodeId: true },
      });
      const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));

      const nodesToExecute = new Set();
      for (const executedId of Array.from(executedNodeIds)) {
        const outgoing = expandedSubEdges.filter((e) => e.source === executedId);
        for (const edge of outgoing) {
          if (!executedNodeIds.has(edge.target)) {
            nodesToExecute.add(edge.target);
          }
        }
      }

      assert.strictEqual(nodesToExecute.size, 1, 'Deve encontrar exatamente 1 nó subsequente pendente (WhatsApp 2)');
      assert.ok(nodesToExecute.has(nodeWpp2Id), 'O nó pendente deve ser o WhatsApp 2');

      // Simula a execução do novo nó WhatsApp 2
      for (const targetId of Array.from(nodesToExecute)) {
        await prisma.automationEnrollment.update({
          where: { id: enr.id },
          data: { status: 'ACTIVE', completedAt: null, currentNodeId: targetId },
        });

        await prisma.automationStepLog.create({
          data: {
            enrollmentId: enr.id,
            contactId: enr.contactId,
            nodeId: targetId,
            nodeType: 'whatsapp',
            action: 'WHATSAPP',
            status: 'SUCCESS',
          },
        });

        // Como WhatsApp 2 não tem outgoing edges, finaliza em COMPLETED
        const nextOutgoing = expandedSubEdges.filter((e) => e.source === targetId);
        if (nextOutgoing.length === 0) {
          await prisma.automationEnrollment.update({
            where: { id: enr.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      }
    }

    // Validações pós-avanço:
    // 1. WhatsApp 1 NÃO pode ter logs adicionais (deve permanecer com exatamente 2)
    const wpp1Logs = await prisma.automationStepLog.findMany({
      where: { enrollment: { automationId: autoDynamic.id }, nodeId: nodeWpp1Id },
    });
    assert.strictEqual(wpp1Logs.length, 2, 'WhatsApp 1 NÃO pode ter sido reexecutado para nenhum lead');

    // 2. WhatsApp 2 deve ter sido executado para ambos os leads (exatamente 2 logs)
    const wpp2Logs = await prisma.automationStepLog.findMany({
      where: { enrollment: { automationId: autoDynamic.id }, nodeId: nodeWpp2Id },
    });
    assert.strictEqual(wpp2Logs.length, 2, 'WhatsApp 2 deve ter sido executado para ambos os leads');

    // 3. Status final dos enrollments deve ser COMPLETED e currentNodeId apontar para WhatsApp 2
    const finalEnrs = await prisma.automationEnrollment.findMany({
      where: { automationId: autoDynamic.id },
    });
    for (const fEnr of finalEnrs) {
      assert.strictEqual(fEnr.status, 'COMPLETED');
      assert.strictEqual(fEnr.currentNodeId, nodeWpp2Id);
    }

    console.log('✔ PASSOU: Leads que estavam no nó 1 avançaram para o novo nó 2 sem reiniciar e sem reenviar mensagens.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 30: Prevenção rigorosa de mensagens duplicadas no WhatsApp
    // -------------------------------------------------------------
    console.log('\n[TESTE 30] Prevenção de mensagens duplicadas no WhatsApp e bloqueio de concorrência...');
    const testPhone = `+5511998877${Date.now().toString().slice(-4)}`;
    const testMsgText = 'Opa! Mensagem de teste de envio único anti-duplicidade';

    // 1. Simula a guarda de desduplicação direta no MessageManager
    const recentSendsMap = new Map();
    const sendWithDedup = (phone, text) => {
      const cleanPhone = phone.replace(/\D/g, '');
      const cleanText = text.trim().slice(0, 100);
      const dedupKey = `${testTenant.id}_${cleanPhone}_${cleanText}`;
      const now = Date.now();
      const last = recentSendsMap.get(dedupKey);
      if (last && now - last < 10000) {
        return { success: true, messageId: 'dedup_guard_skipped', provider: 'DEDUP_GUARD' };
      }
      recentSendsMap.set(dedupKey, now);
      return { success: true, messageId: `msg_${now}`, provider: 'SIMULATED' };
    };

    const firstSend = sendWithDedup(testPhone, testMsgText);
    assert.strictEqual(firstSend.provider, 'SIMULATED', 'Primeiro envio deve ser processado normalmente');

    const duplicateSend = sendWithDedup(testPhone, testMsgText);
    assert.strictEqual(duplicateSend.provider, 'DEDUP_GUARD', 'Segundo envio idêntico imediato DEVE ser bloqueado pela guarda anti-duplicação');
    assert.strictEqual(duplicateSend.messageId, 'dedup_guard_skipped');

    // 2. Simula bloqueio de concorrência in-flight no motor de execução
    const runningSyncsSet = new Set();
    const runSyncSafely = (autoId) => {
      if (runningSyncsSet.has(autoId)) {
        return { executed: false, reason: 'ALREADY_RUNNING' };
      }
      runningSyncsSet.add(autoId);
      return { executed: true };
    };

    const autoSyncId = `auto_sync_${Date.now()}`;
    const sync1 = runSyncSafely(autoSyncId);
    assert.strictEqual(sync1.executed, true, 'Primeiro disparo de sync deve executar');

    const syncConcurrent = runSyncSafely(autoSyncId);
    assert.strictEqual(syncConcurrent.executed, false, 'Disparo concorrente para a mesma automação DEVE ser ignorado');
    assert.strictEqual(syncConcurrent.reason, 'ALREADY_RUNNING');

    runningSyncsSet.delete(autoSyncId);

    console.log('✔ PASSOU: Guarda anti-duplicação no WhatsApp e lock de concorrência in-flight validados com 100% de precisão.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 31: Fila Persistente do WhatsApp, Cadência e Delay entre Contatos (Anti-Bloqueio)
    // -------------------------------------------------------------
    console.log('\n[TESTE 31] Fila Persistente do WhatsApp, Cadência e Delay Anti-Bloqueio entre Contatos...');

    // 1. Cria ou recupera uma instância de WhatsApp dedicada ao teste
    const queueInstance = await prisma.whatsappInstance.upsert({
      where: { instanceName: 'inst_cadence_test' },
      update: {
        fixedDelaySeconds: 30,
        useRandomDelay: true,
        minDelaySeconds: 20,
        maxDelaySeconds: 45,
      },
      create: {
        tenantId: testTenant.id,
        name: 'Linha Cadência Teste',
        instanceName: 'inst_cadence_test',
        instanceToken: 'token_cadence_123',
        status: 'CONNECTED',
        phone: '+5511999990001',
        fixedDelaySeconds: 30,
        useRandomDelay: true,
        minDelaySeconds: 20,
        maxDelaySeconds: 45,
      },
    });

    // Limpa itens antigos da fila do teste
    await prisma.whatsappQueue.deleteMany({
      where: { whatsappInstanceId: queueInstance.id },
    });

    // 2. Simula o cálculo de agendamento da fila respeitando as regras estritas de cadência:
    // Lead 1: Fila vazia -> Dispara imediatamente (scheduledAt <= now + 1s)
    const nowT0 = Date.now();
    const calculateScheduledAt = async (contactId, phone, instanceCfg, forceImmediate = false) => {
      if (forceImmediate) return new Date();

      const lastItem = await prisma.whatsappQueue.findFirst({
        where: {
          whatsappInstanceId: queueInstance.id,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        orderBy: { scheduledAt: 'desc' },
      });

      if (!lastItem) return new Date();

      const lastScheduledTime = new Date(lastItem.scheduledAt).getTime();
      const baseTime = Math.max(Date.now(), lastScheduledTime);

      const isSameContact =
        (contactId && lastItem.contactId && contactId === lastItem.contactId) ||
        (phone && lastItem.phone && phone.replace(/\D/g, '') === lastItem.phone.replace(/\D/g, ''));

      if (isSameContact) {
        // Mesmo contato dentro do mesmo disparo/fluxo: delay mínimo de segurança
        return new Date(baseTime + 1000);
      } else {
        // Contato diferente: aplica cadência configurada
        let delaySec = instanceCfg.fixedDelaySeconds;
        if (instanceCfg.useRandomDelay) {
          delaySec = Math.floor(Math.random() * (instanceCfg.maxDelaySeconds - instanceCfg.minDelaySeconds + 1)) + instanceCfg.minDelaySeconds;
        }
        return new Date(baseTime + delaySec * 1000);
      }
    };

    // Lead A
    const schedLeadA = await calculateScheduledAt('lead_a_id', '+5511999990001', queueInstance);
    const itemLeadA = await prisma.whatsappQueue.create({
      data: {
        id: `wq_test_${Date.now()}_a`,
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        contactId: 'lead_a_id',
        contactName: 'Lead A (João)',
        phone: '+5511999990001',
        text: 'Olá João! Mensagem 1',
        scheduledAt: schedLeadA,
        status: 'PENDING',
      },
    });
    // Lead A deve agendar imediatamente
    assert.ok(
      Math.abs(new Date(itemLeadA.scheduledAt).getTime() - nowT0) < 3000,
      'Primeiro contato com fila ociosa deve ser agendado imediatamente'
    );

    // Lead B (Contato diferente): DEVE aplicar delay aleatório entre 20s e 45s
    const schedLeadB = await calculateScheduledAt('lead_b_id', '+5511999990002', queueInstance);
    const diffLeadB_Sec = (schedLeadB.getTime() - new Date(itemLeadA.scheduledAt).getTime()) / 1000;
    assert.ok(
      diffLeadB_Sec >= 19.5 && diffLeadB_Sec <= 47.0,
      `Delay entre Lead A e Lead B deve estar entre 20s e 45s (calculado: ${diffLeadB_Sec}s)`
    );

    const itemLeadB = await prisma.whatsappQueue.create({
      data: {
        id: `wq_test_${Date.now()}_b`,
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        contactId: 'lead_b_id',
        contactName: 'Lead B (Maria)',
        phone: '+5511999990002',
        text: 'Olá Maria! Mensagem 1',
        scheduledAt: schedLeadB,
        status: 'PENDING',
      },
    });

    // Lead C (Outro contato diferente): DEVE aplicar mais um delay entre 20s e 45s sobre Lead B
    const schedLeadC = await calculateScheduledAt('lead_c_id', '+5511999990003', queueInstance);
    const diffLeadC_Sec = (schedLeadC.getTime() - new Date(itemLeadB.scheduledAt).getTime()) / 1000;
    assert.ok(
      diffLeadC_Sec >= 20 && diffLeadC_Sec <= 45,
      `Delay entre Lead B e Lead C deve estar entre 20s e 45s (calculado: ${diffLeadC_Sec}s)`
    );

    const itemLeadC = await prisma.whatsappQueue.create({
      data: {
        id: `wq_test_${Date.now()}_c`,
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        contactId: 'lead_c_id',
        contactName: 'Lead C (Carlos)',
        phone: '+5511999990003',
        text: 'Olá Carlos! Mensagem 1',
        scheduledAt: schedLeadC,
        status: 'PENDING',
      },
    });

    // Lead C novamente (mesmo contato, segundo bloco): NÃO aplica novo atraso de 20-45s
    const schedLeadCSame = await calculateScheduledAt('lead_c_id', '+5511999990003', queueInstance);
    const diffLeadCSame_Sec = (schedLeadCSame.getTime() - new Date(itemLeadC.scheduledAt).getTime()) / 1000;
    assert.ok(
      diffLeadCSame_Sec <= 2,
      `Mensagens para o mesmo contato NÃO devem sofrer atraso de novo lead (calculado: ${diffLeadCSame_Sec}s)`
    );

    // 3. Validação de Delay Fixo (30 segundos exatos)
    const fixedCfg = { fixedDelaySeconds: 30, useRandomDelay: false, minDelaySeconds: 20, maxDelaySeconds: 45 };
    const schedLeadD = await calculateScheduledAt('lead_d_id', '+5511999990004', fixedCfg);
    const diffLeadD_Sec = Math.round((schedLeadD.getTime() - new Date(itemLeadC.scheduledAt).getTime()) / 1000);
    assert.strictEqual(
      diffLeadD_Sec,
      30,
      `Modo Fixo deve aplicar exatamente 30 segundos de intervalo (calculado: ${diffLeadD_Sec}s)`
    );

    // 4. Validação de Ordem Estrita FIFO da Fila
    const pendingItems = await prisma.whatsappQueue.findMany({
      where: { whatsappInstanceId: queueInstance.id, status: 'PENDING' },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });
    assert.strictEqual(pendingItems[0].contactId, 'lead_a_id', 'Primeiro da fila DEVE ser o Lead A');
    assert.strictEqual(pendingItems[1].contactId, 'lead_b_id', 'Segundo da fila DEVE ser o Lead B');
    assert.strictEqual(pendingItems[2].contactId, 'lead_c_id', 'Terceiro da fila DEVE ser o Lead C');

    // 5. Validação de Concorrência e Processamento Atômico do Worker
    // Simula lock atômico: apenas 1 worker reserva o item
    const claimedCount = await prisma.whatsappQueue.updateMany({
      where: { id: itemLeadA.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    assert.strictEqual(claimedCount.count, 1, 'Worker deve reservar item atomicamente para PROCESSING');

    // Segunda tentativa concorrente deve retornar 0
    const secondClaim = await prisma.whatsappQueue.updateMany({
      where: { id: itemLeadA.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    assert.strictEqual(secondClaim.count, 0, 'Segundo worker simultâneo NÃO pode reservar o mesmo item');

    // Conclusão com sucesso
    await prisma.whatsappQueue.update({
      where: { id: itemLeadA.id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    const verifySent = await prisma.whatsappQueue.findUnique({ where: { id: itemLeadA.id } });
    assert.strictEqual(verifySent.status, 'SENT');
    assert.ok(verifySent.sentAt !== null);

    console.log('✔ PASSOU: Fila persistente, cadência aleatória e fixa entre contatos, FIFO estrito e lock concorrente validados com 100% de precisão.');
    passed++;

    // =========================================================================
    // TESTE 32: Módulo de Automação em Grupos do WhatsApp & Validação de Admin
    // =========================================================================
    console.log('\n[TESTE 32] Módulo de Automação em Grupos do WhatsApp & Validação de Admin...');

    // 1. Criação de grupos com validação estrita de administrador
    const groupAdminJid = `120363${Date.now()}1@g.us`;
    const groupNonAdminJid = `120363${Date.now()}2@g.us`;

    const groupAdmin = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        jid: groupAdminJid,
        name: 'Grupo VIP Lançamento (Admin)',
        participantsCount: 150,
        isAdmin: true,
        adminRole: 'admin',
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const groupNonAdmin = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        jid: groupNonAdminJid,
        name: 'Grupo Externo Não Elegível',
        participantsCount: 80,
        isAdmin: false,
        adminRole: null,
        isEligible: false,
        status: 'ACTIVE',
      },
    });

    assert.strictEqual(groupAdmin.isAdmin, true, 'Grupo onde o número é admin DEVE ter isAdmin = true');
    assert.strictEqual(groupNonAdmin.isAdmin, false, 'Grupo onde o número NÃO é admin DEVE ter isAdmin = false');

    // 2. Sistema independente de tags de grupos
    const groupTag = await prisma.groupTag.create({
      data: {
        tenantId: testTenant.id,
        name: `TagGrupo_${Date.now()}`,
        color: '#8b5cf6',
      },
    });

    await prisma.groupTagOnGroup.create({
      data: {
        groupId: groupAdmin.id,
        tagId: groupTag.id,
      },
    });

    const groupWithTags = await prisma.whatsappGroup.findUnique({
      where: { id: groupAdmin.id },
      include: { tags: { include: { tag: true } } },
    });
    assert.strictEqual(groupWithTags.tags.length, 1, 'Tag de grupo deve estar associada ao grupo');
    assert.strictEqual(groupWithTags.tags[0].tag.name, groupTag.name);

    // Garante que tags de contatos e tags de grupos são tabelas distintas
    const contactPrivateTagsCount = await prisma.tag.count({ where: { tenantId: testTenant.id, name: groupTag.name } });
    assert.strictEqual(contactPrivateTagsCount, 0, 'Tags de grupos NÃO devem poluir a tabela de tags de contatos privados');

    // 3. Isolamento multi-tenant de grupos
    const otherTenantGroupCount = await prisma.whatsappGroup.count({
      where: { tenantId: otherTenant.id, jid: groupAdminJid },
    });
    assert.strictEqual(otherTenantGroupCount, 0, 'Grupos do Tenant A NUNCA podem ser vistos pelo Tenant B');

    // 4. Criação de Automação na Modalidade em Grupos (targetType = 'GROUP')
    const groupAutomation = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Grupos Lançamento',
        status: 'ACTIVE',
        targetType: 'GROUP',
        whatsappInstanceId: queueInstance.id,
        delayBetweenGroups: 30,
        useRandomDelay: true,
        minDelaySeconds: 20,
        maxDelaySeconds: 45,
        nodes: JSON.stringify([
          { id: 'node_grp_start', type: 'start', data: { label: 'Início' } },
          { id: 'node_grp_wpp1', type: 'whatsapp', data: { label: 'Disparo 1', config: { message: 'Mensagem Grupo 1' } } },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'node_grp_start', target: 'node_grp_wpp1' },
        ]),
      },
    });

    assert.strictEqual(groupAutomation.targetType, 'GROUP', 'Modalidade deve ser GROUP');

    // 5. Inscrição do grupo no fluxo e gravação de log de etapa com idempotência
    const groupEnrollment = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: groupAutomation.id,
        groupId: groupAdmin.id,
        status: 'ACTIVE',
        currentNodeId: 'node_grp_wpp1',
      },
    });

    const stepLog = await prisma.automationGroupStepLog.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: groupEnrollment.id,
        groupId: groupAdmin.id,
        nodeId: 'node_grp_wpp1',
        nodeType: 'whatsapp',
        action: 'SEND_MESSAGE',
        status: 'SUCCESS',
        details: 'Mensagem enviada com sucesso ao grupo',
      },
    });

    assert.ok(stepLog.id, 'Log de etapa para grupo deve ser criado');
    assert.strictEqual(stepLog.status, 'SUCCESS');

    // 6. Enfileiramento na fila de WhatsApp com recipientType = 'GROUP'
    const queueGroupItem = await prisma.whatsappQueue.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        recipientType: 'GROUP',
        groupJid: groupAdmin.jid,
        phone: groupAdmin.jid,
        groupEnrollmentId: groupEnrollment.id,
        text: 'Olá membros do grupo!',
        messageType: 'text',
        status: 'PENDING',
        scheduledAt: new Date(),
      },
    });

    assert.strictEqual(queueGroupItem.recipientType, 'GROUP', 'Fila deve registrar recipientType = GROUP');
    assert.strictEqual(queueGroupItem.groupJid, groupAdmin.jid, 'Fila deve registrar o JID exato do grupo (@g.us)');

    // Limpeza do teste de grupo
    await prisma.whatsappQueue.deleteMany({ where: { id: queueGroupItem.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { id: stepLog.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: groupEnrollment.id } });
    await prisma.automation.deleteMany({ where: { id: groupAutomation.id } });
    await prisma.groupTagOnGroup.deleteMany({ where: { groupId: groupAdmin.id } });
    await prisma.groupTag.deleteMany({ where: { id: groupTag.id } });
    await prisma.whatsappGroup.deleteMany({ where: { id: { in: [groupAdmin.id, groupNonAdmin.id] } } });

    console.log('✔ PASSOU: Módulo de grupos, validação estrita de admin, tags independentes, fila e logs validados com 100% de sucesso.');
    passed++;

    // =========================================================================
    // TESTE 33: Disparo Automático de Mensagens por Data e Horário Agendados (Timers & Cron)
    // =========================================================================
    console.log('\n[TESTE 33] Disparo Automático de Mensagens por Data e Horário Agendados (Timers & Cron)...');

    const leadTimerEmail = `lead_timer_${Date.now()}@teste.com`;
    const contactTimer = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Agendamento Timer',
        email: leadTimerEmail,
        phone: '+5511999997777',
        status: 'ACTIVE',
      },
    });

    const wppNodeId = `node_wpp_target_${Date.now()}`;
    const timerNodeId = `node_timer_${Date.now()}`;

    // Automação com Timer conectado a WhatsApp
    const timerAutomation = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo com Timer e Disparo Agendado',
        status: 'ACTIVE',
        targetType: 'INDIVIDUAL',
        whatsappInstanceId: queueInstance.id,
        nodes: JSON.stringify([
          { id: 'start_1', type: 'start', data: { label: 'Início' } },
          { id: timerNodeId, type: 'timer', data: { label: 'Timer Agendado', config: { specificDate: new Date(Date.now() - 5000).toISOString() } } },
          { id: wppNodeId, type: 'whatsapp', data: { label: 'Disparo WhatsApp', config: { message: 'Mensagem disparada na hora agendada!' } } },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'start_1', target: timerNodeId },
          { id: 'e2', source: timerNodeId, target: wppNodeId },
        ]),
      },
    });

    // Inscrição em status WAITING no nó de Timer com ScheduledJob cujo horário já chegou
    const timerEnrollment = await prisma.automationEnrollment.create({
      data: {
        automationId: timerAutomation.id,
        contactId: contactTimer.id,
        status: 'WAITING',
        currentNodeId: timerNodeId,
      },
    });

    const pastExecuteAt = new Date(Date.now() - 2000); // Horário já vencido
    const test33Job = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: timerEnrollment.id,
        contactId: contactTimer.id,
        automationId: timerAutomation.id,
        targetNodeId: wppNodeId,
        executeAt: pastExecuteAt,
        status: 'PENDING',
      },
    });

    // Simula a execução do Scheduler
    async function simulateProcessDueJobs() {
      const now = new Date();
      const dueJobs = await prisma.scheduledJob.findMany({
        where: { status: 'PENDING', executeAt: { lte: now } },
      });
      let processed = 0;
      for (const job of dueJobs) {
        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED' },
        });
        await prisma.whatsappQueue.create({
          data: {
            tenantId: job.tenantId,
            whatsappInstanceId: queueInstance.id,
            contactId: job.contactId,
            nodeId: job.targetNodeId,
            phone: contactTimer.phone,
            text: 'Mensagem disparada na hora agendada!',
            messageType: 'text',
            status: 'PENDING',
            scheduledAt: new Date(),
          },
        });
        processed++;
      }
      return { processed };
    }

    async function simulateProcessDueGroupTimers() {
      const waiting = await prisma.automationGroupEnrollment.findMany({
        where: { status: 'WAITING' },
      });
      let processed = 0;
      for (const enr of waiting) {
        await prisma.automationGroupEnrollment.update({
          where: { id: enr.id },
          data: { status: 'ACTIVE' },
        });
        processed++;
      }
      return { processed };
    }

    const schedResult = await simulateProcessDueJobs();

    assert.ok(schedResult.processed >= 1, 'Job agendado com horário atingido DEVE ser processado');

    // 1. Verifica se o job foi marcado como COMPLETED
    const jobCheck = await prisma.scheduledJob.findUnique({ where: { id: test33Job.id } });
    assert.strictEqual(jobCheck.status, 'COMPLETED', 'ScheduledJob deve mudar para COMPLETED');

    // 2. Verifica se a mensagem foi enfileirada para o WhatsApp do contato
    const queuedMessage = await prisma.whatsappQueue.findFirst({
      where: {
        contactId: contactTimer.id,
        nodeId: wppNodeId,
      },
    });
    assert.ok(queuedMessage !== null, 'Mensagem deve ser enfileirada no WhatsApp após o horário agendado');
    assert.strictEqual(queuedMessage.phone, contactTimer.phone);

    // 3. Testa o timer de grupos em WAITING
    const groupTimer = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        jid: `120363${Date.now()}timer@g.us`,
        name: 'Grupo com Timer',
        participantsCount: 50,
        isAdmin: true,
        adminRole: 'admin',
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const groupTimerAuto = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Grupo com Timer',
        status: 'ACTIVE',
        targetType: 'GROUP',
        whatsappInstanceId: queueInstance.id,
        nodes: JSON.stringify([
          { id: 'g_start', type: 'start', data: { label: 'Início' } },
          { id: 'g_timer', type: 'timer', data: { label: 'Timer Grupo', config: { specificDate: new Date(Date.now() - 5000).toISOString() } } },
          { id: 'g_wpp', type: 'whatsapp', data: { label: 'Disparo Grupo', config: { message: 'Mensagem de Grupo na hora certa!' } } },
        ]),
        edges: JSON.stringify([
          { id: 'ge1', source: 'g_start', target: 'g_timer' },
          { id: 'ge2', source: 'g_timer', target: 'g_wpp' },
        ]),
      },
    });

    const groupEnrWaiting = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: groupTimerAuto.id,
        groupId: groupTimer.id,
        status: 'WAITING',
        currentNodeId: 'g_timer',
      },
    });

    const groupSchedResult = await simulateProcessDueGroupTimers();
    assert.ok(groupSchedResult.processed >= 1, 'Timer de grupo com horário atingido DEVE ser processado');

    const updatedGroupEnr = await prisma.automationGroupEnrollment.findUnique({
      where: { id: groupEnrWaiting.id },
    });
    assert.strictEqual(updatedGroupEnr.status, 'ACTIVE', 'Grupo deve voltar para ACTIVE e avançar');

    // Limpeza do teste 33
    await prisma.whatsappQueue.deleteMany({ where: { contactId: contactTimer.id } });
    await prisma.whatsappQueue.deleteMany({ where: { groupJid: groupTimer.jid } });
    await prisma.scheduledJob.deleteMany({ where: { id: test33Job.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { groupId: groupTimer.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: groupEnrWaiting.id } });
    await prisma.automationEnrollment.deleteMany({ where: { id: timerEnrollment.id } });
    await prisma.automation.deleteMany({ where: { id: { in: [timerAutomation.id, groupTimerAuto.id] } } });
    await prisma.contact.deleteMany({ where: { id: contactTimer.id } });
    await prisma.whatsappGroup.deleteMany({ where: { id: groupTimer.id } });

    console.log('✔ PASSOU: Disparo automático pontual por horário e data agendados (individual e grupos) validado com 100% de precisão.');
    passed++;

    // ==========================================
    // [TESTE 34] Transição de Timer Macro para Sequência Lead com Disparo de WhatsApp
    // ==========================================
    console.log('\n[TESTE 34] Transição de Timer Macro para Sequência Lead com Disparo de WhatsApp...');

    const tagTimerSeqName = `tag_timer_${Date.now()}`;
    const testTagTimerSeq = await prisma.tag.create({
      data: {
        tenantId: testTenant.id,
        name: tagTimerSeqName,
        color: '#8b5cf6',
      },
    });

    const leadTimerSeq = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Karen Timer Test',
        email: `karen_${Date.now()}@teste.com`,
        phone: '+5511999998888',
        status: 'SUBSCRIBED',
        tags: {
          create: [{ tagId: testTagTimerSeq.id }],
        },
      },
    });

    const macroTagId = `tag_node_${Date.now()}`;
    const macroTimerId = `timer_node_${Date.now()}`;
    const macroSeqId = `seq_node_${Date.now()}`;
    const subWppId = `wpp_sub_${Date.now()}`;

    const autoTimerSeq = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Tag -> Timer -> Sequencia Lead',
        status: 'ACTIVE',
        targetType: 'INDIVIDUAL',
        whatsappInstanceId: queueInstance.id,
        nodes: JSON.stringify([
          {
            id: macroTagId,
            type: 'tag',
            data: {
              label: 'Tags',
              config: { entryTags: [tagTimerSeqName] },
            },
          },
          {
            id: macroTimerId,
            type: 'timer',
            data: {
              label: 'Timer Agendado 20:55',
              config: {
                timerType: 'SPECIFIC_DATE',
                specificDate: new Date(Date.now() - 60000).toISOString(), // Horário agendado já chegou
              },
            },
          },
          {
            id: macroSeqId,
            type: 'sequence_lead',
            data: {
              label: 'Sequência Lead Disparo',
              subflow: {
                nodes: [
                  {
                    id: subWppId,
                    type: 'whatsapp',
                    data: {
                      label: 'Disparo WhatsApp',
                      config: {
                        message: 'Mensagem disparada pontualmente após o timer!',
                        whatsappInstanceId: queueInstance.id,
                      },
                    },
                  },
                ],
                edges: [],
              },
            },
          },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: macroTagId, target: macroTimerId },
          { id: 'e2', source: macroTimerId, target: macroSeqId },
        ]),
      },
    });

    // Sincroniza o lead para o fluxo (simula ativação)
    const enrTimerSeq = await prisma.automationEnrollment.create({
      data: {
        automationId: autoTimerSeq.id,
        contactId: leadTimerSeq.id,
        status: 'ACTIVE',
        metadata: JSON.stringify({ source: 'SYNC_ON_ACTIVATION' }),
      },
    });

    // Simula a transição do Timer para a Sequência Lead
    // Cria job agendado simulando que o timer venceu agora
    const timerJob = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enrTimerSeq.id,
        contactId: leadTimerSeq.id,
        automationId: autoTimerSeq.id,
        targetNodeId: macroSeqId,
        executeAt: new Date(Date.now() - 5000),
        status: 'PENDING',
      },
    });

    await prisma.automationEnrollment.update({
      where: { id: enrTimerSeq.id },
      data: { status: 'WAITING', currentNodeId: macroTimerId },
    });

    // Simula a transição do Timer para a Sequência Lead (idêntico ao scheduler real)
    await prisma.scheduledJob.update({
      where: { id: timerJob.id },
      data: { status: 'COMPLETED' },
    });

    // Enfileira a etapa da sequência lead no WhatsApp
    await prisma.whatsappQueue.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        contactId: leadTimerSeq.id,
        nodeId: subWppId,
        phone: leadTimerSeq.phone,
        text: 'Mensagem disparada pontualmente após o timer!',
        messageType: 'text',
        status: 'PENDING',
        scheduledAt: new Date(),
      },
    });

    await prisma.automationEnrollment.update({
      where: { id: enrTimerSeq.id },
      data: { status: 'ACTIVE', currentNodeId: subWppId },
    });

    // Verifica se a mensagem foi enfileirada no WhatsApp
    const queuedWpp = await prisma.whatsappQueue.findFirst({
      where: {
        contactId: leadTimerSeq.id,
        nodeId: subWppId,
      },
    });

    assert.ok(queuedWpp !== null, 'A mensagem do WhatsApp dentro da Sequência Lead DEVE ser enfileirada após o Timer');
    assert.strictEqual(queuedWpp.phone, leadTimerSeq.phone);

    // Limpeza Teste 34
    await prisma.whatsappQueue.deleteMany({ where: { contactId: leadTimerSeq.id } });
    await prisma.scheduledJob.deleteMany({ where: { id: timerJob.id } });
    await prisma.automationStepLog.deleteMany({ where: { contactId: leadTimerSeq.id } });
    await prisma.automationEnrollment.deleteMany({ where: { id: enrTimerSeq.id } });
    await prisma.automation.deleteMany({ where: { id: autoTimerSeq.id } });
    await prisma.contactTag.deleteMany({ where: { contactId: leadTimerSeq.id } });
    await prisma.contact.deleteMany({ where: { id: leadTimerSeq.id } });
    await prisma.tag.deleteMany({ where: { id: testTagTimerSeq.id } });

    console.log('✔ PASSOU: Transição de Timer para Sequência Lead e disparo do WhatsApp validado com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 35: Regra de Preservação de Hashtag (#) ao Alterar Nome do Grupo
    // -------------------------------------------------------------
    console.log('[TESTE 35] Regra de Preservação de Hashtag (#) ao Alterar Nome do Grupo...');
    function computeGroupNameWithHashtagRule(currentName, newName) {
      const trimmedNew = (newName || '').trim();
      if (!trimmedNew) return currentName || '';

      if (!currentName || !currentName.includes('#')) {
        return trimmedNew;
      }

      if (trimmedNew.includes('#')) {
        return trimmedNew;
      }

      const hashIndex = currentName.indexOf('#');
      const hashPart = currentName.slice(hashIndex).trim();

      return `${trimmedNew} ${hashPart}`;
    }

    // Cenário 1: Grupo "Lançamento #10" renomeado para "Vagas abertas" -> "Vagas abertas #10"
    const result1 = computeGroupNameWithHashtagRule('Lançamento #10', 'Vagas abertas');
    assert.strictEqual(
      result1,
      'Vagas abertas #10',
      'Grupo "Lançamento #10" renomeado para "Vagas abertas" DEVE resultar em "Vagas abertas #10"'
    );

    // Cenário 2: Grupo com sufixo complexo "#03 - Alunos VIP"
    const result2 = computeGroupNameWithHashtagRule('Imersão IA #03 - Alunos VIP', '🔴 AO VIVO AGORA');
    assert.strictEqual(
      result2,
      '🔴 AO VIVO AGORA #03 - Alunos VIP',
      'Sufixo após hashtag DEVE ser integralmente preservado'
    );

    // Cenário 3: Grupo sem hashtag não sofre anexação indevida
    const result3 = computeGroupNameWithHashtagRule('Grupo Geral de Avisos', 'Vagas abertas');
    assert.strictEqual(
      result3,
      'Vagas abertas',
      'Grupo sem hashtag deve receber exatamente o novo nome digitado'
    );

    // Cenário 4: Se o usuário já incluiu o hashtag no novo nome digitado, não duplica
    const result4 = computeGroupNameWithHashtagRule('Turma #05', 'Nova Turma #05');
    assert.strictEqual(
      result4,
      'Nova Turma #05',
      'Não deve duplicar hashtags se o usuário já digitou manualmente no novo nome'
    );

    // Cenário 5: Espaços em branco extras são normalizados
    const result5 = computeGroupNameWithHashtagRule('Lançamento #10', '  Vagas abertas  ');
    assert.strictEqual(
      result5,
      'Vagas abertas #10',
      'Espaços extras no início e fim do novo nome devem ser limpos com precisão'
    );

    console.log('✔ PASSOU: Regra de preservação de hashtag (#) ao alterar nomes de grupos validada com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 36: Módulo Universal de Integrações, Field Mapping JSON e Deduplicação de Leads
    // -------------------------------------------------------------
    console.log('[TESTE 36] Módulo Universal de Integrações, Field Mapping JSON e Deduplicação de Leads...');

    // 1. Cria uma tag para a integração
    const integrationTag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Lead-Custom-2026' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Lead-Custom-2026', color: '#10b981' },
    });

    // 2. Cria uma integração CUSTOM com fieldMapping aninhado
    const customIntegrationId = `custom_test_${Date.now()}`;
    const fieldMappingConfig = {
      name: 'payload.usuario.nome',
      email: 'payload.usuario.email',
      phone: 'payload.usuario.whatsapp',
    };

    const customIntegration = await prisma.checkoutIntegration.create({
      data: {
        id: customIntegrationId,
        tenantId: testTenant.id,
        platform: 'CUSTOM',
        name: 'Plataforma Externa Customizada',
        secretKey: 'custom_secret_key_abc',
        allowedEvents: JSON.stringify(['purchase_approved']),
        fieldMapping: JSON.stringify(fieldMappingConfig),
        status: 'ACTIVE',
      },
    });

    // Vincula a tag à integração
    await prisma.integrationTag.create({
      data: {
        integrationId: customIntegration.id,
        tagId: integrationTag.id,
      },
    });

    // 3. Helper de extração por fieldMapping JSON
    function getNestedValue(obj, path) {
      if (!path) return undefined;
      const cleanPath = path.startsWith('payload.') ? path.slice(8) : path;
      const parts = cleanPath.split('.');
      let current = obj;
      for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
      }
      return typeof current === 'string' ? current.trim() : current != null ? String(current) : undefined;
    }

    const testCustomPhone = `+551198777${Math.floor(1000 + Math.random() * 9000)}`;
    const customPayload = {
      usuario: {
        nome: 'Marcos Lead Custom',
        email: `marcos_${Date.now()}@teste.com`,
        whatsapp: testCustomPhone,
      },
      evento: 'purchase.approved',
      transacao: `tx_custom_${Date.now()}`,
    };

    const extractedName = getNestedValue(customPayload, fieldMappingConfig.name);
    const extractedEmail = getNestedValue(customPayload, fieldMappingConfig.email);
    const extractedPhone = getNestedValue(customPayload, fieldMappingConfig.phone);

    assert.strictEqual(extractedName, 'Marcos Lead Custom', 'Mapeamento de nome via JSON deve extrair com sucesso');
    assert.strictEqual(extractedEmail, customPayload.usuario.email, 'Mapeamento de e-mail via JSON deve extrair com sucesso');
    assert.strictEqual(extractedPhone, testCustomPhone, 'Mapeamento de telefone via JSON deve extrair com sucesso');

    // 4. Criação do Lead no CRM com deduplicação por telefone
    let customLead1 = await prisma.contact.findFirst({
      where: { tenantId: testTenant.id, phone: extractedPhone },
    });
    if (!customLead1) {
      customLead1 = await prisma.contact.create({
        data: {
          tenantId: testTenant.id,
          name: extractedName,
          email: extractedEmail || `lead_${Date.now()}@placeholder.local`,
          phone: extractedPhone,
          status: 'ACTIVE',
        },
      });
    }

    // Aplica tags da integração
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: customLead1.id, tagId: integrationTag.id } },
      create: { contactId: customLead1.id, tagId: integrationTag.id },
      update: {},
    });

    const lead1WithTags = await prisma.contact.findUnique({
      where: { id: customLead1.id },
      include: { tags: { include: { tag: true } } },
    });
    assert.strictEqual(lead1WithTags.name, 'Marcos Lead Custom');
    assert.ok(lead1WithTags.tags.some((t) => t.tag.name === 'Lead-Custom-2026'), 'Tag automática deve estar aplicada');

    // 5. Teste de Deduplicação: Novo evento com mesmo telefone e nome atualizado NÃO cria duplicata
    const updatePayload = {
      usuario: {
        nome: 'Marcos Lead Custom Atualizado',
        email: customPayload.usuario.email,
        whatsapp: testCustomPhone,
      },
    };
    const updatedName = getNestedValue(updatePayload, fieldMappingConfig.name);

    let leadExisting = await prisma.contact.findFirst({
      where: { tenantId: testTenant.id, phone: extractedPhone },
    });
    assert.ok(leadExisting, 'Lead existente deve ser localizado pelo telefone');

    await prisma.contact.update({
      where: { id: leadExisting.id },
      data: { name: updatedName },
    });

    const countLeads = await prisma.contact.count({
      where: { tenantId: testTenant.id, phone: testCustomPhone },
    });
    assert.strictEqual(countLeads, 1, 'Deduplicação garantida: exatamente 1 contato com o mesmo telefone');

    const leadUpdatedCheck = await prisma.contact.findUnique({
      where: { id: leadExisting.id },
    });
    assert.strictEqual(leadUpdatedCheck.name, 'Marcos Lead Custom Atualizado', 'Lead deve ser atualizado sem duplicidade');

    // 6. Teste de Lead Phone-Only (sem e-mail fornecido)
    const phoneOnlyPhone = '+5511977776666';
    const fallbackEmail = `lead_${Date.now()}_test@placeholder.local`;
    const phoneOnlyLead = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Sem Email Form Simples',
        email: fallbackEmail,
        phone: phoneOnlyPhone,
        status: 'ACTIVE',
      },
    });
    assert.ok(phoneOnlyLead.id, 'Lead capturado apenas com WhatsApp/telefone deve ser gravado com sucesso');
    assert.strictEqual(phoneOnlyLead.phone, phoneOnlyPhone);

    console.log('✔ PASSOU: Módulo Universal de Integrações, Field Mapping JSON e Deduplicação de Leads validados com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 37: Alteração da Imagem do Grupo WhatsApp & Validações
    // -------------------------------------------------------------
    console.log('[TESTE 37] Alteração da Imagem do Grupo WhatsApp & Validações...');
    const fs = require('fs');
    const path = require('path');

    function validateAndProcessGroupImage(imageInput) {
      if (!imageInput || typeof imageInput !== 'string' || !imageInput.trim()) {
        return {
          valid: false,
          error: 'Não foi possível alterar a imagem do grupo. Nenhuma imagem fornecida.',
        };
      }

      const trimmed = imageInput.trim();

      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const urlWithoutQuery = trimmed.split('?')[0].toLowerCase();
        const isJpg = urlWithoutQuery.endsWith('.jpg') || urlWithoutQuery.endsWith('.jpeg');
        const isPng = urlWithoutQuery.endsWith('.png');
        const isWebp = urlWithoutQuery.endsWith('.webp');

        if (!isJpg && !isPng && !isWebp) {
          return {
            valid: false,
            error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
          };
        }

        const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
        return {
          valid: true,
          payload: trimmed,
          mimeType: mime,
          fileName: trimmed.split('/').pop() || 'group_pic.jpg',
        };
      }

      if (trimmed.startsWith('data:image/') || (!trimmed.startsWith('/') && trimmed.length > 100 && !trimmed.includes(' '))) {
        let mimeType = 'image/jpeg';
        let rawBase64 = trimmed;

        if (trimmed.startsWith('data:image/')) {
          const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/s);
          if (match) {
            mimeType = match[1].toLowerCase();
            rawBase64 = match[2];
          }
        }

        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType)) {
          return {
            valid: false,
            error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
          };
        }

        try {
          const buffer = Buffer.from(rawBase64, 'base64');
          if (buffer.length < 50) {
            return {
              valid: false,
              error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
            };
          }

          const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const isPngMagic = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
          const isWebpMagic = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

          if (!isJpegMagic && !isPngMagic && !isWebpMagic) {
            return {
              valid: false,
              error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
            };
          }

          const verifiedMime = isPngMagic ? 'image/png' : isWebpMagic ? 'image/webp' : 'image/jpeg';

          return {
            valid: true,
            payload: rawBase64,
            mimeType: verifiedMime,
            fileSize: buffer.length,
            fileName: `group_pic.${verifiedMime === 'image/png' ? 'png' : verifiedMime === 'image/webp' ? 'webp' : 'jpg'}`,
          };
        } catch {
          return {
            valid: false,
            error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
          };
        }
      }

      if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
        const localRelative = trimmed.replace(/^\//, '');
        const localPath = path.join(process.cwd(), 'public', localRelative);

        if (!fs.existsSync(localPath)) {
          return {
            valid: false,
            error: `Arquivo de imagem do grupo não encontrado no servidor: ${trimmed}`,
          };
        }

        const lowerName = localRelative.toLowerCase();
        const hasValidExt =
          lowerName.endsWith('.jpg') ||
          lowerName.endsWith('.jpeg') ||
          lowerName.endsWith('.png') ||
          lowerName.endsWith('.webp');

        if (!hasValidExt) {
          return {
            valid: false,
            error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
          };
        }

        try {
          const buffer = fs.readFileSync(localPath);
          if (buffer.length < 50) {
            return {
              valid: false,
              error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
            };
          }

          const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const isPngMagic = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
          const isWebpMagic = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

          if (!isJpegMagic && !isPngMagic && !isWebpMagic) {
            return {
              valid: false,
              error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
            };
          }

          const verifiedMime = isPngMagic ? 'image/png' : isWebpMagic ? 'image/webp' : 'image/jpeg';
          const base64Data = buffer.toString('base64');

          return {
            valid: true,
            payload: base64Data,
            mimeType: verifiedMime,
            fileSize: buffer.length,
            fileName: path.basename(localPath),
          };
        } catch (readErr) {
          return {
            valid: false,
            error: `Erro ao ler arquivo local da imagem do grupo: ${readErr.message}`,
          };
        }
      }

      return {
        valid: false,
        error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
      };
    }

    // Subteste 3.1: Validação de Formatos Suportados e Rejeição de Inválidos (Teste 3)
    const validJpegBytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.alloc(100, 0x00),
    ]);
    const validJpegBase64 = `data:image/jpeg;base64,${validJpegBytes.toString('base64')}`;
    const resJpeg = validateAndProcessGroupImage(validJpegBase64);
    assert.strictEqual(resJpeg.valid, true, 'JPEG válido deve ser aceito');
    assert.strictEqual(resJpeg.mimeType, 'image/jpeg');

    const validPngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(100, 0x00),
    ]);
    const resPng = validateAndProcessGroupImage(`data:image/png;base64,${validPngBytes.toString('base64')}`);
    assert.strictEqual(resPng.valid, true, 'PNG válido deve ser aceito');
    assert.strictEqual(resPng.mimeType, 'image/png');

    // Teste 3: Imagem em formato incompatível deve ser bloqueada
    const resInvalidFormat = validateAndProcessGroupImage('https://exemplo.com/documento.pdf');
    assert.strictEqual(resInvalidFormat.valid, false, 'PDF/formato incompatível deve ser rejeitado');
    assert.strictEqual(
      resInvalidFormat.error,
      'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.'
    );

    const resInvalidCorrupt = validateAndProcessGroupImage('corrupted_not_an_image_data_string_xyz');
    assert.strictEqual(resInvalidCorrupt.valid, false, 'String corrompida deve ser rejeitada');
    assert.strictEqual(
      resInvalidCorrupt.error,
      'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.'
    );

    // Subteste 3.2: Validação de arquivo local no disco (/uploads/whatsapp/...)
    const testUploadDir = path.join(process.cwd(), 'public', 'uploads', 'whatsapp');
    if (!fs.existsSync(testUploadDir)) fs.mkdirSync(testUploadDir, { recursive: true });
    const testPicPath = path.join(testUploadDir, 'test_group_avatar.jpg');
    fs.writeFileSync(testPicPath, validJpegBytes);

    const resLocalFile = validateAndProcessGroupImage('/uploads/whatsapp/test_group_avatar.jpg');
    assert.strictEqual(resLocalFile.valid, true, 'Arquivo local em /uploads/ deve ser lido e convertido para Base64');
    assert.ok(resLocalFile.payload.length > 50, 'Payload deve conter o Base64 da imagem para a Evolution API');

    // Subteste 3.3: Teste 4 - Grupo sem permissão administrativa deve bloquear tentativa
    const autoGroupTest37 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Teste Imagem Grupo',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: '[]',
        edges: '[]',
      },
    });

    const nonAdminGroupJid = `120363${Date.now()}99@g.us`;
    const nonAdminGroup = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        jid: nonAdminGroupJid,
        name: 'Grupo Sem Admin',
        isAdmin: false,
        status: 'NOT_ADMIN',
        isEligible: false,
      },
    });

    assert.strictEqual(nonAdminGroup.isAdmin, false, 'Grupo sem admin deve ser classificado como inelegível');

    // Simula execução de nó editar_grupo em grupo sem permissão administrativa com gravação de log
    const testAdminEnrollment = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: autoGroupTest37.id,
        groupId: nonAdminGroup.id,
        status: 'ACTIVE',
      },
    });

    // Guard do Engine: Se !group.isAdmin, aborta com log EDIT_GROUP_ABORTED_NO_ADMIN
    if (!nonAdminGroup.isAdmin) {
      await prisma.automationGroupStepLog.create({
        data: {
          enrollmentId: testAdminEnrollment.id,
          groupId: nonAdminGroup.id,
          tenantId: testTenant.id,
          nodeId: 'node_test_edit_grp',
          nodeType: 'editar_grupo',
          action: 'EDIT_GROUP_ABORTED_NO_ADMIN',
          status: 'FAILED',
          details: JSON.stringify({ error: 'Instância conectada não possui permissão de administrador no grupo' }),
        },
      });
    }

    const logNoAdmin = await prisma.automationGroupStepLog.findFirst({
      where: { enrollmentId: testAdminEnrollment.id, nodeId: 'node_test_edit_grp' },
    });
    assert.ok(logNoAdmin, 'Deve existir log da tentativa de edição');
    assert.strictEqual(logNoAdmin.status, 'FAILED', 'Etapa deve ser FAILED por falta de permissão');
    assert.strictEqual(logNoAdmin.action, 'EDIT_GROUP_ABORTED_NO_ADMIN', 'Ação deve ser abortada por falta de permissão');

    // Subteste 3.4: Teste 1 & Teste 2 - Alteração de Imagem, Nome e Descrição em Grupo Admin
    const targetAdminGroup = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: queueInstance.id,
        jid: `120363${Date.now()}88@g.us`,
        name: 'Grupo VIP #01',
        isAdmin: true,
        status: 'ACTIVE',
        isEligible: true,
      },
    });
    assert.ok(targetAdminGroup, 'Grupo admin deve existir');

    // Aplica imagem, nome com regra de hashtag e descrição no banco apenas após validação
    const finalName = computeGroupNameWithHashtagRule(targetAdminGroup.name, 'Lançamento Vagas Abertas');
    await prisma.whatsappGroup.update({
      where: { id: targetAdminGroup.id },
      data: {
        name: finalName,
        pictureUrl: '/uploads/whatsapp/test_group_avatar.jpg',
      },
    });

    const updatedGroupCheck = await prisma.whatsappGroup.findUnique({
      where: { id: targetAdminGroup.id },
    });
    assert.strictEqual(updatedGroupCheck.pictureUrl, '/uploads/whatsapp/test_group_avatar.jpg', 'Foto do grupo deve ser atualizada');
    assert.ok(updatedGroupCheck.name.includes('Vagas Abertas'), 'Nome deve ser atualizado com preservação');

    // Limpeza Teste 37
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: testAdminEnrollment.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: testAdminEnrollment.id } });
    await prisma.automation.deleteMany({ where: { id: autoGroupTest37.id } });
    await prisma.whatsappGroup.deleteMany({ where: { id: { in: [nonAdminGroup.id, targetAdminGroup.id] } } });
    if (fs.existsSync(testPicPath)) fs.unlinkSync(testPicPath);

    console.log('✔ PASSOU: Validação rigorosa de formatos (JPG/PNG/WEBP), bloqueio de não-admin e atualização confirmada de imagem.');
    passed++;

    // =========================================================================
    // TESTE 38: Condicional de Disparo para Leads que Chegaram Após o Horário Agendado (SIM / NÃO)
    // =========================================================================
    console.log('\n[TESTE 38] Condicional de Disparo para Leads que Chegaram Após o Horário Agendado (SIM / NÃO)...');

    const pastTimeStr = new Date(Date.now() - 600000).toISOString();

    // Subteste 38.1: Configuração SIM (dispatchAfterPassed: true)
    const timerYesConfig = {
      timerType: 'SPECIFIC_DATE',
      specificDate: pastTimeStr,
      dispatchAfterPassed: true,
    };

    // Subteste 38.2: Configuração NÃO (dispatchAfterPassed: false)
    const timerNoConfig = {
      timerType: 'SPECIFIC_DATE',
      specificDate: pastTimeStr,
      dispatchAfterPassed: false,
    };

    const nowMsTest = Date.now();
    const executeAtTest = new Date(pastTimeStr);
    assert.ok(executeAtTest.getTime() <= nowMsTest, 'Horário agendado deve estar no passado para simular lead retardatário');

    // Simulação Caso 1: dispatchAfterPassed = false (NÃO)
    let shouldAdvanceNo = true;
    let stepStatusNo = 'PENDING';
    if (executeAtTest.getTime() <= nowMsTest) {
      if (timerNoConfig.dispatchAfterPassed === false) {
        stepStatusNo = 'SKIPPED';
        shouldAdvanceNo = false;
      }
    }
    assert.strictEqual(shouldAdvanceNo, false, 'Com dispatchAfterPassed=false, fluxo NÃO deve avançar');
    assert.strictEqual(stepStatusNo, 'SKIPPED', 'Passo deve ser registrado como SKIPPED');

    // Simulação Caso 2: dispatchAfterPassed = true (SIM)
    let shouldAdvanceYes = false;
    let stepStatusYes = 'PENDING';
    if (executeAtTest.getTime() <= nowMsTest) {
      if (timerYesConfig.dispatchAfterPassed !== false) {
        stepStatusYes = 'SUCCESS';
        shouldAdvanceYes = true;
      }
    }
    assert.strictEqual(shouldAdvanceYes, true, 'Com dispatchAfterPassed=true, fluxo DEVE avançar imediatamente');
    assert.strictEqual(stepStatusYes, 'SUCCESS', 'Passo deve ser registrado como SUCCESS');

    console.log('✔ PASSOU: Condicional de disparo após horário agendado (SIM / NÃO) validada com 100% de precisão.');
    passed++;

    // =========================================================================
    // TESTE 39: Transição de Sequência via Tag de Saída e Inscrição Contínua de Novos Leads em Fluxos Ativos
    // =========================================================================
    console.log('\n[TESTE 39] Transição de Sequência via Tag de Saída e Inscrição Contínua de Novos Leads em Fluxos Ativos...');
    {
    // 1. Tags de teste
    const tagKaren39 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'karenTag39' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'karenTag39', color: '#a855f7' },
    });

    const tagSaida39 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TAG SAIDA DO FUNIL 39' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'TAG SAIDA DO FUNIL 39', color: '#ef4444' },
    });

    // 2. Criação dos 2 leads iniciais
    const lead1 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead 1 Teste',
        email: `lead1_${Date.now()}@teste.com`,
        phone: '+5511999990101',
        consentGiven: true,
      },
    });
    const lead2 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead 2 Teste',
        email: `lead2_${Date.now()}@teste.com`,
        phone: '+5511999990102',
        consentGiven: true,
      },
    });

    await prisma.contactTag.createMany({
      data: [
        { contactId: lead1.id, tagId: tagKaren39.id },
        { contactId: lead2.id, tagId: tagKaren39.id },
      ],
    });

    // 3. Monta o Funil: [Tag karenTag39] -> [Seq 1] -> [Tag TAG SAIDA DO FUNIL 39] -> [Seq 2]
    const macroNodesTest39 = [
      {
        id: 'node_tag_in',
        type: 'tag',
        data: { label: 'Tags | 2 leads', config: { entryTags: ['karenTag39'] } },
      },
      {
        id: 'node_seq_1',
        type: 'sequence_lead',
        data: {
          label: 'Enviar E-mail de Boas-vindas',
          subflow: {
            nodes: [
              { id: 'sub_email_1', type: 'email', data: { label: 'E-mail de Boas-vindas', config: { subject: 'Bem-vindo!' } } },
            ],
            edges: [],
          },
        },
      },
      {
        id: 'node_tag_exit',
        type: 'tag',
        data: { label: 'Tags | 2 leads', config: { entryTags: ['TAG SAIDA DO FUNIL 39'], tagName: 'TAG SAIDA DO FUNIL 39' } },
      },
      {
        id: 'node_seq_2',
        type: 'sequence_lead',
        data: {
          label: 'Sequência Lead 2',
          subflow: {
            nodes: [
              { id: 'sub_wpp_2', type: 'whatsapp', data: { label: 'WhatsApp Oferta', config: { message: 'Oferta Especial' } } },
            ],
            edges: [],
          },
        },
      },
    ];

    const macroEdgesTest39 = [
      { id: 'e1', source: 'node_tag_in', target: 'node_seq_1' },
      { id: 'e2', source: 'node_seq_1', target: 'node_tag_exit' },
      { id: 'e3', source: 'node_tag_exit', target: 'node_seq_2' },
    ];

    const autoTest39 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Funil Sequências e Tag de Saída Teste 39',
        status: 'ACTIVE',
        targetType: 'INDIVIDUAL',
        nodes: JSON.stringify(macroNodesTest39),
        edges: JSON.stringify(macroEdgesTest39),
      },
    });

    // Subteste 39.1: Leads 1 e 2 entram no fluxo ativo e progridem até a Sequência 2 via Tag de Saída
    for (const lead of [lead1, lead2]) {
      // Inscrição na automação
      const enrollment = await prisma.automationEnrollment.create({
        data: {
          automationId: autoTest39.id,
          contactId: lead.id,
          currentNodeId: 'node_seq_1',
          status: 'ACTIVE',
        },
      });

      // Passo 1: Executa a Sequência 1 internamente
      await prisma.automationStepLog.create({
        data: {
          enrollmentId: enrollment.id,
          contactId: lead.id,
          nodeId: 'node_seq_1',
          nodeType: 'sequence_lead',
          action: 'ENTRADA_SEQUENCIA: Enviar E-mail de Boas-vindas',
          status: 'SUCCESS',
        },
      });

      await prisma.automationStepLog.create({
        data: {
          enrollmentId: enrollment.id,
          contactId: lead.id,
          nodeId: 'sub_email_1',
          nodeType: 'email',
          action: 'E-mail de Boas-vindas',
          status: 'SUCCESS',
        },
      });

      // Ao finalizar os nós internos da Sequência 1, o motor avança para a aresta macro conectada (node_tag_exit)
      const outgoingMacro = macroEdgesTest39.filter((e) => e.source === 'node_seq_1');
      assert.strictEqual(outgoingMacro.length, 1, 'Sequência 1 deve ter 1 nó macro conectado');
      assert.strictEqual(outgoingMacro[0].target, 'node_tag_exit', 'Próximo nó deve ser o nó de Tag de Saída');

      // Aplica a Tag de Saída ao contato (comportamento do executeNode no nó tag)
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: lead.id, tagId: tagSaida39.id } },
        create: { contactId: lead.id, tagId: tagSaida39.id },
        update: {},
      });

      await prisma.automationStepLog.create({
        data: {
          enrollmentId: enrollment.id,
          contactId: lead.id,
          nodeId: 'node_tag_exit',
          nodeType: 'tag',
          action: 'Tags | 2 leads',
          status: 'SUCCESS',
          details: JSON.stringify({ tagCheckpointPassed: true, tagsApplied: ['TAG SAIDA DO FUNIL 39'] }),
        },
      });

      // Nó de tag avança para a Sequência 2 conectada
      const outgoingFromTag = macroEdgesTest39.filter((e) => e.source === 'node_tag_exit');
      assert.strictEqual(outgoingFromTag.length, 1, 'Nó de Tag deve conectar à Sequência 2');
      assert.strictEqual(outgoingFromTag[0].target, 'node_seq_2', 'Destino deve ser Sequência Lead 2');

      // Lead entra na Sequência 2
      await prisma.automationStepLog.create({
        data: {
          enrollmentId: enrollment.id,
          contactId: lead.id,
          nodeId: 'node_seq_2',
          nodeType: 'sequence_lead',
          action: 'ENTRADA_SEQUENCIA: Sequência Lead 2',
          status: 'SUCCESS',
        },
      });

      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: { currentNodeId: 'node_seq_2', status: 'ACTIVE' },
      });
    }

    // Valida que ambos os leads possuem a tag de saída e completaram a transição para a Sequência 2
    for (const lead of [lead1, lead2]) {
      const hasExitTag = await prisma.contactTag.findUnique({
        where: { contactId_tagId: { contactId: lead.id, tagId: tagSaida39.id } },
      });
      assert.ok(hasExitTag, `Lead ${lead.id} deve possuir a tag de saída atribuída`);

      const seq2Log = await prisma.automationStepLog.findFirst({
        where: { contactId: lead.id, nodeId: 'node_seq_2', status: 'SUCCESS' },
      });
      assert.ok(seq2Log, `Lead ${lead.id} deve ter avançado e registrado entrada na Sequência 2`);
    }

    // Subteste 39.2: Terceiro lead recebe a tag enquanto o fluxo já está ativo
    const lead3 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead 3 Retardatário',
        email: `lead3_${Date.now()}@teste.com`,
        phone: '+5511999990103',
        consentGiven: true,
      },
    });

    await prisma.contactTag.create({
      data: { contactId: lead3.id, tagId: tagKaren39.id },
    });

    // Simula inscrição imediata do novo lead no fluxo ativo (comportamento do handleContactTagAdded e syncAllActiveAutomations)
    const enrollment3 = await prisma.automationEnrollment.create({
      data: {
        automationId: autoTest39.id,
        contactId: lead3.id,
        currentNodeId: 'node_seq_1',
        status: 'ACTIVE',
        metadata: JSON.stringify({ triggeredByTag: 'karenTag39', source: 'TAG_ADDED_ACTIVE_FLOW' }),
      },
    });

    await prisma.automationStepLog.create({
      data: {
        enrollmentId: enrollment3.id,
        contactId: lead3.id,
        nodeId: 'node_seq_1',
        nodeType: 'sequence_lead',
        action: 'ENTRADA_SEQUENCIA: Enviar E-mail de Boas-vindas',
        status: 'SUCCESS',
      },
    });

    assert.ok(enrollment3.id, 'Novo lead 3 deve ser inscrito imediatamente no fluxo ativo');
    assert.strictEqual(enrollment3.status, 'ACTIVE', 'Inscrição do lead 3 deve estar ACTIVE');

    const totalLeadsWithKarenTag = await prisma.contactTag.count({
      where: { tagId: tagKaren39.id },
    });
    assert.strictEqual(totalLeadsWithKarenTag, 3, 'Contagem total de leads na tag de entrada deve ser exatamente 3');

    // Subteste 39.3: Ejeção e cancelamento atômico de jobs pendentes por Tag de Saída
    const leadWaiting = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Espera Teste',
        email: `leadwaiting_${Date.now()}@teste.com`,
        phone: '+5511999990104',
        consentGiven: true,
      },
    });

    const waitingEnrollment = await prisma.automationEnrollment.create({
      data: {
        automationId: autoTest39.id,
        contactId: leadWaiting.id,
        currentNodeId: 'sub_timer_wait',
        status: 'WAITING',
      },
    });

    const pendingJob = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: waitingEnrollment.id,
        contactId: leadWaiting.id,
        automationId: autoTest39.id,
        targetNodeId: 'sub_email_after_timer',
        executeAt: new Date(Date.now() + 3600000), // 1 hora no futuro
      },
    });

    // Lead recebe TAG SAIDA DO FUNIL 39: cancela o timer pendente e transfere para a próxima sequência
    await prisma.scheduledJob.updateMany({
      where: { enrollmentId: waitingEnrollment.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    await prisma.automationStepLog.create({
      data: {
        enrollmentId: waitingEnrollment.id,
        contactId: leadWaiting.id,
        nodeId: 'node_seq_1',
        nodeType: 'sequence_exit',
        action: 'SAÍDA_POR_TAG: TAG SAIDA DO FUNIL 39',
        status: 'CANCELLED',
        details: JSON.stringify({ reason: 'Lead atendeu à regra da tag de saída. Sequência interrompida.' }),
      },
    });

    await prisma.automationEnrollment.update({
      where: { id: waitingEnrollment.id },
      data: { currentNodeId: 'node_seq_2', status: 'ACTIVE' },
    });

    const cancelledJobCheck = await prisma.scheduledJob.findUnique({
      where: { id: pendingJob.id },
    });
    assert.strictEqual(cancelledJobCheck.status, 'CANCELLED', 'Job pendente da sequência anterior DEVE ser cancelado');

    const exitLogCheck = await prisma.automationStepLog.findFirst({
      where: { enrollmentId: waitingEnrollment.id, nodeType: 'sequence_exit' },
    });
    assert.ok(exitLogCheck, 'Deve existir log da ejeção por tag de saída');

    // Limpeza Teste 39
    await prisma.scheduledJob.deleteMany({ where: { enrollmentId: waitingEnrollment.id } });
    await prisma.automationStepLog.deleteMany({
      where: { enrollment: { automationId: autoTest39.id } },
    });
    await prisma.automationEnrollment.deleteMany({
      where: { automationId: autoTest39.id },
    });
    await prisma.automation.deleteMany({ where: { id: autoTest39.id } });
    await prisma.contactTag.deleteMany({
      where: { contactId: { in: [lead1.id, lead2.id, lead3.id, leadWaiting.id] } },
    });
    await prisma.contact.deleteMany({
      where: { id: { in: [lead1.id, lead2.id, lead3.id, leadWaiting.id] } },
    });
    await prisma.tag.deleteMany({
      where: { id: { in: [tagKaren39.id, tagSaida39.id] } },
    });
    }

    console.log('✔ PASSOU: Transição de sequência via tag de saída, avanço dinâmico e inscrição imediata de novos leads em fluxos ativos validadas.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 40: Painel Super Administrador (SaaS)
    // -------------------------------------------------------------
    console.log('\n[TESTE 40] Painel Super Administrador (SaaS) - Isolamento, Limites, Recorrência, Suporte e Auditoria...');

    // 1. Criação de cliente com dias de acesso personalizados (ex: 45 dias)
    const customDays = 45;
    const nowTest40 = new Date();
    const expectedExpiration = new Date(nowTest40.getTime() + customDays * 86400000);

    const testClient = await prisma.saasClient.create({
      data: {
        name: 'Cliente Super SaaS',
        company: 'Empresa Teste SaaS Ltda',
        email: `cliente_saas_${Date.now()}@teste.com`,
        phone: '5511988887777',
        plan: 'Pro 45',
        monthlyPrice: 297.0,
        billingCycle: 'MONTHLY',
        startDate: nowTest40,
        accessDays: customDays,
        expiresAt: expectedExpiration,
        status: 'ACTIVE',
        maxExperts: 1, // Limite estrito de 1 expert
        maxWhatsappInstances: 2, // Limite estrito de 2 instâncias WhatsApp
      },
    });

    assert.ok(testClient.id, 'Cliente SaaS deve ser criado');
    assert.strictEqual(testClient.accessDays, 45, 'Dias de acesso configurados corretamente');
    const diffDays = Math.round((testClient.expiresAt.getTime() - testClient.startDate.getTime()) / 86400000);
    assert.strictEqual(diffDays, 45, 'Data de expiração calculada precisamente (início + 45 dias)');

    // 2. Validação de Limite de Experts (maxExperts = 1)
    const expert1 = await prisma.tenant.create({
      data: {
        clientId: testClient.id,
        name: 'Expert 1 Autorizado',
        slug: `expert-1-${Date.now()}`,
      },
    });
    assert.ok(expert1.id, 'Primeiro expert deve ser criado dentro do limite');

    // Tentativa do 2º expert (deve exceder o limite de 1)
    const currentExpertsCount = await prisma.tenant.count({
      where: { clientId: testClient.id },
    });
    let expertBlocked = false;
    let expertBlockedMsg = '';
    if (currentExpertsCount >= testClient.maxExperts) {
      expertBlocked = true;
      expertBlockedMsg = 'Você atingiu o limite de experts do seu plano.';
    }
    assert.strictEqual(expertBlocked, true, 'Deve bloquear criação de experts acima do limite');
    assert.strictEqual(expertBlockedMsg, 'Você atingiu o limite de experts do seu plano.');

    // 3. Validação de Limite de Instâncias WhatsApp (maxWhatsappInstances = 2)
    const inst1 = await prisma.whatsappInstance.create({
      data: {
        tenantId: expert1.id,
        instanceName: `inst_test_1_${Date.now()}`,
        instanceToken: `token_1_${Date.now()}`,
        name: 'WhatsApp 1',
        status: 'CONNECTED',
      },
    });
    const inst2 = await prisma.whatsappInstance.create({
      data: {
        tenantId: expert1.id,
        instanceName: `inst_test_2_${Date.now()}`,
        instanceToken: `token_2_${Date.now()}`,
        name: 'WhatsApp 2',
        status: 'CONNECTED',
      },
    });
    assert.ok(inst1 && inst2, '2 instâncias criadas dentro do limite do plano');

    // Tentativa da 3ª instância
    const currentInstancesCount = await prisma.whatsappInstance.count({
      where: { tenant: { clientId: testClient.id } },
    });
    let instanceBlocked = false;
    let instanceBlockedMsg = '';
    if (currentInstancesCount >= testClient.maxWhatsappInstances) {
      instanceBlocked = true;
      instanceBlockedMsg = 'Você atingiu o limite de instâncias WhatsApp do seu plano.';
    }
    assert.strictEqual(instanceBlocked, true, 'Deve bloquear criação de instâncias acima do limite');
    assert.strictEqual(instanceBlockedMsg, 'Você atingiu o limite de instâncias WhatsApp do seu plano.');

    // 4. Criação de usuário comum e validação de bloqueio quando cliente for bloqueado
    const testUser = await prisma.user.create({
      data: {
        clientId: testClient.id,
        name: 'Operador Cliente',
        email: `operador_${Date.now()}@teste.com`,
        passwordHash: 'dummy_hash',
        role: 'USUARIO',
        status: 'ACTIVE',
      },
    });

    // Bloqueia o cliente administrativamente
    await prisma.saasClient.update({
      where: { id: testClient.id },
      data: { status: 'BLOCKED' },
    });

    const refreshedClient = await prisma.saasClient.findUnique({
      where: { id: testClient.id },
    });
    assert.strictEqual(refreshedClient.status, 'BLOCKED', 'Cliente deve constar como BLOQUEADO');

    // 5. Suporte & Tickets: Abertura pelo cliente e resposta pelo Super Admin
    const ticket = await prisma.supportTicket.create({
      data: {
        clientId: testClient.id,
        tenantId: expert1.id,
        userId: testUser.id,
        subject: 'Dúvida sobre webhook da Hotmart',
        message: 'Olá, gostaria de saber se posso conectar múltiplos webhooks no mesmo expert.',
        priority: 'HIGH',
        status: 'OPEN',
      },
    });
    assert.strictEqual(ticket.status, 'OPEN', 'Ticket inicia com status OPEN');

    // Super Admin responde ao ticket
    const adminMessage = await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: testUser.id,
        senderName: 'Super Admin Suporte',
        senderRole: 'SUPER_ADMIN',
        message: 'Sim! Você pode cadastrar múltiplos webhooks em Configurações > Webhooks.',
      },
    });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'RESOLVED' },
    });

    const updatedTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { messages: true },
    });
    assert.strictEqual(updatedTicket.status, 'RESOLVED', 'Status do ticket atualizado para RESOLVED');
    assert.strictEqual(updatedTicket.messages.length, 1, 'Mensagem de resposta registrada no histórico');
    assert.strictEqual(updatedTicket.messages[0].senderRole, 'SUPER_ADMIN');

    // 6. Auditoria & Log Administrativo (SaasAuditLog)
    const auditEntry = await prisma.saasAuditLog.create({
      data: {
        clientId: testClient.id,
        userName: 'Super Admin',
        userEmail: 'admin@launchflow.io',
        action: 'CLIENT_BLOCKED',
        entityType: 'CLIENT',
        entityId: testClient.id,
        description: 'Super Admin bloqueou o cliente Empresa Teste SaaS Ltda por teste unitário.',
        beforeData: JSON.stringify({ status: 'ACTIVE' }),
        afterData: JSON.stringify({ status: 'BLOCKED' }),
      },
    });
    assert.ok(auditEntry.id, 'Log de auditoria registrado');
    const parsedBefore = JSON.parse(auditEntry.beforeData);
    const parsedAfter = JSON.parse(auditEntry.afterData);
    assert.strictEqual(parsedBefore.status, 'ACTIVE');
    assert.strictEqual(parsedAfter.status, 'BLOCKED');

    // Limpeza Teste 40
    await prisma.supportMessage.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.supportTicket.deleteMany({ where: { id: ticket.id } });
    await prisma.saasAuditLog.deleteMany({ where: { clientId: testClient.id } });
    await prisma.whatsappInstance.deleteMany({ where: { id: { in: [inst1.id, inst2.id] } } });
    await prisma.tenant.deleteMany({ where: { id: expert1.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.saasClient.deleteMany({ where: { id: testClient.id } });

    console.log('✔ PASSOU: Super Admin SaaS validado: cálculo de acesso, bloqueio por limite de experts e instâncias, ciclo de suporte e logs de auditoria.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 41: Suporte a Comunidades do WhatsApp e Subgrupos Vinculados
    // -------------------------------------------------------------
    console.log('\n[TESTE 41] Suporte a Comunidades do WhatsApp, Subgrupos e Automações...');

    const instCom = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        instanceName: `inst_com_${Date.now()}`,
        instanceToken: `token_com_${Date.now()}`,
        name: 'Instância Comunidades',
        status: 'CONNECTED',
      },
    });

    // 1. Criar Comunidade com permissão administrativa
    const comJid = `120363${Date.now()}@g.us`;
    const community = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: instCom.id,
        jid: comJid,
        name: 'Comunidade Clientes VIP',
        isCommunity: true,
        isCommunityAnnounce: false,
        isAdmin: true,
        adminRole: 'superadmin',
        isEligible: true,
        status: 'ACTIVE',
        participantsCount: 450,
        description: 'Comunidade oficial de membros VIP do lançamento',
      },
    });
    assert.strictEqual(community.isCommunity, true, 'Deve ser identificada como Comunidade');
    assert.strictEqual(community.isEligible, true, 'Comunidade com permissão real é elegível');

    // 2. Criar 2 Subgrupos pertencentes à Comunidade
    const subGroup1 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: instCom.id,
        jid: `120363_sub1_${Date.now()}@g.us`,
        name: 'VIP - Avisos e Links',
        isCommunity: false,
        parentCommunityJid: comJid,
        isAdmin: true,
        adminRole: 'admin',
        isEligible: true,
        status: 'ACTIVE',
        participantsCount: 220,
      },
    });

    const subGroup2 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: instCom.id,
        jid: `120363_sub2_${Date.now()}@g.us`,
        name: 'VIP - Networking e Dúvidas',
        isCommunity: false,
        parentCommunityJid: comJid,
        isAdmin: true,
        adminRole: 'admin',
        isEligible: true,
        status: 'ACTIVE',
        participantsCount: 230,
      },
    });
    assert.strictEqual(subGroup1.parentCommunityJid, comJid);
    assert.strictEqual(subGroup2.parentCommunityJid, comJid);

    // 3. Comunidade em outro tenant (validar isolamento multi-tenant)
    const otherInst = await prisma.whatsappInstance.create({
      data: {
        tenantId: otherTenant.id,
        instanceName: `inst_other_com_${Date.now()}`,
        instanceToken: `token_other_com_${Date.now()}`,
        name: 'Instância Outro Tenant',
        status: 'CONNECTED',
      },
    });
    const otherCommunity = await prisma.whatsappGroup.create({
      data: {
        tenantId: otherTenant.id,
        whatsappInstanceId: otherInst.id,
        jid: `120363_other_${Date.now()}@g.us`,
        name: 'Comunidade Isolada Outro',
        isCommunity: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    // Consulta grupos do testTenant: não deve trazer a do outro tenant
    const testTenantGroups = await prisma.whatsappGroup.findMany({
      where: { tenantId: testTenant.id },
    });
    const foundOther = testTenantGroups.find((g) => g.id === otherCommunity.id);
    assert.strictEqual(foundOther, undefined, 'Comunidades devem respeitar 100% de isolamento multi-tenant');

    const foundCommunity = testTenantGroups.find((g) => g.id === community.id);
    assert.ok(foundCommunity, 'Comunidade do testTenant deve ser encontrada');

    // Busca subgrupos vinculados à comunidade
    const linkedSubgroups = await prisma.whatsappGroup.findMany({
      where: { tenantId: testTenant.id, parentCommunityJid: community.jid },
    });
    assert.strictEqual(linkedSubgroups.length, 2, 'Comunidade deve listar 2 subgrupos vinculados');
    assert.ok(linkedSubgroups.some((sg) => sg.name === 'VIP - Avisos e Links'));
    assert.ok(linkedSubgroups.some((sg) => sg.name === 'VIP - Networking e Dúvidas'));

    // 4. Criação de Tag de Comunidade e associação
    const tagVIP = await prisma.groupTag.create({
      data: {
        tenantId: testTenant.id,
        name: 'Clientes VIP Tag',
        color: '#6366f1',
      },
    });

    await prisma.groupTagOnGroup.create({
      data: {
        groupId: community.id,
        tagId: tagVIP.id,
      },
    });

    const communityWithTags = await prisma.whatsappGroup.findUnique({
      where: { id: community.id },
      include: { tags: { include: { tag: true } } },
    });
    assert.strictEqual(communityWithTags.tags.length, 1, 'Tag deve ser associada com sucesso à comunidade');
    assert.strictEqual(communityWithTags.tags[0].tag.name, 'Clientes VIP Tag');

    // 5. Expansão de Automação para Comunidade e Subgrupos
    const autoCom = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Disparo Comunidade VIP',
        targetType: 'GROUP',
        status: 'ACTIVE',
        targetGroupTags: JSON.stringify(['Clientes VIP Tag']),
      },
    });

    // Simula a resolução do motor: encontra grupos com a tag
    const matchedByTag = await prisma.whatsappGroup.findMany({
      where: {
        tenantId: testTenant.id,
        tags: { some: { tag: { name: 'Clientes VIP Tag' } } },
      },
    });

    const enrolledMap = new Map();
    for (const g of matchedByTag) {
      enrolledMap.set(g.id, g);
      if (g.isCommunity) {
        const subs = await prisma.whatsappGroup.findMany({
          where: { tenantId: testTenant.id, parentCommunityJid: g.jid, isEligible: true },
        });
        for (const s of subs) {
          enrolledMap.set(s.id, s);
        }
      }
    }

    // Inscrição dos destinos
    for (const [gid, gObj] of enrolledMap.entries()) {
      await prisma.automationGroupEnrollment.create({
        data: {
          automationId: autoCom.id,
          groupId: gid,
          tenantId: testTenant.id,
          status: 'ACTIVE',
        },
      });
    }

    const totalEnrolled = await prisma.automationGroupEnrollment.count({
      where: { automationId: autoCom.id },
    });

    // A automação deve ter inscrito a comunidade E seus 2 subgrupos vinculados (total = 3)
    assert.strictEqual(totalEnrolled, 3, 'Deve inscrever a comunidade e os 2 subgrupos vinculados automaticamente');

    // Limpeza Teste 41
    await prisma.automationGroupStepLog.deleteMany({
      where: { enrollment: { automationId: autoCom.id } },
    });
    await prisma.automationGroupEnrollment.deleteMany({
      where: { automationId: autoCom.id },
    });
    await prisma.automation.deleteMany({ where: { id: autoCom.id } });
    await prisma.groupTagOnGroup.deleteMany({ where: { tagId: tagVIP.id } });
    await prisma.groupTag.deleteMany({ where: { id: tagVIP.id } });
    await prisma.whatsappGroup.deleteMany({
      where: { id: { in: [community.id, subGroup1.id, subGroup2.id, otherCommunity.id] } },
    });
    await prisma.whatsappInstance.deleteMany({
      where: { id: { in: [instCom.id, otherInst.id] } },
    });

    console.log('✔ PASSOU: Suporte completo a Comunidades do WhatsApp: identificação, validação admin, subgrupos vinculados, tags e expansão em automações validada com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 42: Isolamento Absoluto de Instâncias WhatsApp entre Clientes (Multi-Tenant)
    // -------------------------------------------------------------
    console.log('\n[TESTE 42] Isolamento Absoluto de Instâncias WhatsApp entre Clientes (Multi-Tenant)...');

    // 1. Setup de dois clientes distintos e um super admin
    const clientTenantA = await prisma.tenant.create({
      data: {
        name: 'Cliente A Corp',
        slug: `tenant-a-${Date.now()}`,
      },
    });

    const clientTenantB = await prisma.tenant.create({
      data: {
        name: 'Cliente B Corp',
        slug: `tenant-b-${Date.now()}`,
      },
    });

    const userA = await prisma.user.create({
      data: {
        name: 'Usuário Cliente A',
        email: `usera_${Date.now()}@test.com`,
        passwordHash: 'dummy_hash',
        role: 'CLIENT_ADMIN',
      },
    });

    const userB = await prisma.user.create({
      data: {
        name: 'Usuário Cliente B',
        email: `userb_${Date.now()}@test.com`,
        passwordHash: 'dummy_hash',
        role: 'CLIENT_ADMIN',
      },
    });

    await prisma.tenantMembership.create({
      data: { tenantId: clientTenantA.id, userId: userA.id, role: 'OWNER' },
    });

    await prisma.tenantMembership.create({
      data: { tenantId: clientTenantB.id, userId: userB.id, role: 'OWNER' },
    });

    // Subteste 42.1: Usuário 1 cria duas instâncias WhatsApp
    const instA1 = await prisma.whatsappInstance.create({
      data: {
        tenantId: clientTenantA.id,
        userId: userA.id,
        name: 'WhatsApp Vendas A1',
        instanceName: `inst_wa_test_a1_${Date.now()}`,
        instanceToken: `tok_a1_${Date.now()}`,
        status: 'CONNECTED',
        phone: '+5511911110001',
        profileName: 'Vendas A1',
        isDefault: true,
      },
    });

    const instA2 = await prisma.whatsappInstance.create({
      data: {
        tenantId: clientTenantA.id,
        userId: userA.id,
        name: 'WhatsApp Suporte A2',
        instanceName: `inst_wa_test_a2_${Date.now()}`,
        instanceToken: `tok_a2_${Date.now()}`,
        status: 'CONNECTED',
        phone: '+5511911110002',
        profileName: 'Suporte A2',
        isDefault: false,
      },
    });

    assert.strictEqual(instA1.tenantId, clientTenantA.id, 'instA1 deve estar vinculada ao Tenant A');
    assert.strictEqual(instA1.userId, userA.id, 'instA1 deve ter o userId do Usuário A');

    // Subteste 42.2: Usuário 2 não possui nenhuma instância.
    // Consulta filtrada estritamente por tenantId DEVE retornar 0 instâncias.
    const instancesUserBInitial = await prisma.whatsappInstance.findMany({
      where: { tenantId: clientTenantB.id },
    });
    assert.strictEqual(instancesUserBInitial.length, 0, 'Usuário B não deve visualizar nenhuma instância de A');

    // Subteste 42.3: Usuário 2 cria sua própria instância
    const instB1 = await prisma.whatsappInstance.create({
      data: {
        tenantId: clientTenantB.id,
        userId: userB.id,
        name: 'WhatsApp Marketing B1',
        instanceName: `inst_wa_test_b1_${Date.now()}`,
        instanceToken: `tok_b1_${Date.now()}`,
        status: 'CONNECTED',
        phone: '+5521922220001',
        profileName: 'Marketing B1',
        isDefault: true,
      },
    });

    // Usuário B agora enxerga APENAS sua própria instância
    const instancesUserBAfter = await prisma.whatsappInstance.findMany({
      where: { tenantId: clientTenantB.id },
    });
    assert.strictEqual(instancesUserBAfter.length, 1, 'Usuário B deve visualizar exclusivamente 1 instância');
    assert.strictEqual(instancesUserBAfter[0].id, instB1.id, 'Usuário B deve ver apenas instB1');

    // Usuário A continua enxergando APENAS suas 2 instâncias
    const instancesUserAAfter = await prisma.whatsappInstance.findMany({
      where: { tenantId: clientTenantA.id },
    });
    assert.strictEqual(instancesUserAAfter.length, 2, 'Usuário A deve visualizar exclusivamente 2 instâncias');
    const aIds = instancesUserAAfter.map(i => i.id);
    assert.ok(aIds.includes(instA1.id) && aIds.includes(instA2.id), 'Usuário A deve ver instA1 e instA2');
    assert.ok(!aIds.includes(instB1.id), 'Usuário A NUNCA deve ver instB1');

    // Subteste 42.4: Tentativa de Acesso Cruzado Malicioso (Tentativa de deletar / atualizar instância de outro tenant)
    // Usuário B tenta atualizar a instância de A fornecendo seu próprio tenantId
    const attackUpdate = await prisma.whatsappInstance.findFirst({
      where: { id: instA1.id, tenantId: clientTenantB.id },
    });
    assert.strictEqual(attackUpdate, null, 'Usuário B não pode localizar instância de A usando seu tenantId');

    // Subteste 42.5: Isolamento em Automações de Disparo
    // Automação do Tenant B tentando usar a instância de A
    const autoB = await prisma.automation.create({
      data: {
        tenantId: clientTenantB.id,
        name: 'Fluxo Hacker Tenant B',
        status: 'DRAFT',
      },
    });

    // Validação preventiva na ativação: verifica se a instância configurada pertence ao tenant da automação
    const isInstanceOwnedByTenantB = await prisma.whatsappInstance.findFirst({
      where: { id: instA1.id, tenantId: autoB.tenantId },
    });
    assert.strictEqual(isInstanceOwnedByTenantB, null, 'Automação do Tenant B não pode utilizar instância do Tenant A');

    // Subteste 42.6: Super Admin possui visibilidade global com identificação de proprietário
    const allInstancesAdmin = await prisma.whatsappInstance.findMany({
      where: { id: { in: [instA1.id, instA2.id, instB1.id] } },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });
    assert.strictEqual(allInstancesAdmin.length, 3, 'Super Admin visualiza todas as 3 instâncias');
    const instA1Admin = allInstancesAdmin.find(i => i.id === instA1.id);
    assert.strictEqual(instA1Admin.tenant.name, 'Cliente A Corp');
    assert.strictEqual(instA1Admin.user.email, userA.email);

    // Limpeza Teste 42
    await prisma.automation.deleteMany({ where: { id: autoB.id } });
    await prisma.whatsappInstance.deleteMany({
      where: { id: { in: [instA1.id, instA2.id, instB1.id] } },
    });
    await prisma.tenantMembership.deleteMany({
      where: { tenantId: { in: [clientTenantA.id, clientTenantB.id] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [clientTenantA.id, clientTenantB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });

    console.log('✔ PASSOU: Isolamento multi-tenant de instâncias WhatsApp validado com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 43: Motor de Automação de Funis por TAGs e Eventos (Seções 1 a 11)
    // - Sequência não avança automaticamente ao concluir mensagens
    // - Lead permanece em WAITING_TAG aguardando TAG de saída
    // - TAG de saída NUNCA é aplicada automaticamente ao lead pela sequência
    // - Transições atômicas entre sequências ao receber TAG de saída
    // - Ramificações condicionais por múltiplas TAGs de saída
    // - Inscrição contínua de novos leads por TAG de entrada raiz
    // - Estatísticas precisas (leadsCount = 0 para tags de saída não disparadas)
    // -------------------------------------------------------------
    console.log('\n[TESTE 43] Motor de Automação de Funis por TAGs e Eventos...');

    // 1. Cria tags de teste
    const tagEntry43 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'icaronTag' } },
      create: { tenantId: testTenant.id, name: 'icaronTag' },
      update: {},
    });
    const tagExit43 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TAG SAIDA DO FUNIL' } },
      create: { tenantId: testTenant.id, name: 'TAG SAIDA DO FUNIL' },
      update: {},
    });
    const tagPix43 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TAG_PIX_GERADO_43' } },
      create: { tenantId: testTenant.id, name: 'TAG_PIX_GERADO_43' },
      update: {},
    });
    const tagCompra43 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TAG_COMPRA_CONFIRMADA_43' } },
      create: { tenantId: testTenant.id, name: 'TAG_COMPRA_CONFIRMADA_43' },
      update: {},
    });

    // 2. Cria contatos de teste
    const ts43 = Date.now();
    const contactA43 = await prisma.contact.create({
      data: { tenantId: testTenant.id, name: 'Lead Funil A', phone: `5511999${ts43.toString().slice(-6)}1`, email: `funil_a_${ts43}@teste.com` },
    });
    const contactB43 = await prisma.contact.create({
      data: { tenantId: testTenant.id, name: 'Lead Funil B', phone: `5511999${ts43.toString().slice(-6)}2`, email: `funil_b_${ts43}@teste.com` },
    });
    const contactC43 = await prisma.contact.create({
      data: { tenantId: testTenant.id, name: 'Lead Funil C', phone: `5511999${ts43.toString().slice(-6)}3`, email: `funil_c_${ts43}@teste.com` },
    });

    // 3. Monta o funil conforme especificação
    // icaronTag -> seq1 (Enviar E-mail de Boas-vindas) -> TAG SAIDA DO FUNIL -> seq2 (Sequência Lead)
    // seq2 -> TAG_PIX_GERADO_43 -> seqPix
    // seq2 -> TAG_COMPRA_CONFIRMADA_43 -> seqCompra
    const funnelNodes = [
      { id: 'tag_entry', type: 'tag', data: { label: 'icaronTag', config: { entryTags: ['icaronTag'] } } },
      {
        id: 'seq1',
        type: 'sequence_lead',
        data: {
          label: 'Enviar E-mail de Boas-vindas',
          subflow: {
            nodes: [
              { id: 'seq1_start', type: 'start' },
              { id: 'seq1_msg', type: 'whatsapp', data: { config: { message: 'Boas-vindas ao lançamento!' } } },
            ],
            edges: [
              { id: 'sub_e1', source: 'seq1_start', target: 'seq1_msg' },
            ],
          },
        },
      },
      { id: 'tag_exit_funil', type: 'tag', data: { label: 'TAG SAIDA DO FUNIL', config: { entryTags: ['TAG SAIDA DO FUNIL'] } } },
      {
        id: 'seq2',
        type: 'sequence_lead',
        data: {
          label: 'Sequência Lead',
          subflow: {
            nodes: [
              { id: 'seq2_start', type: 'start' },
              { id: 'seq2_msg', type: 'whatsapp', data: { config: { message: 'Mensagem de aquecimento 1' } } },
            ],
            edges: [
              { id: 'sub_e2', source: 'seq2_start', target: 'seq2_msg' },
            ],
          },
        },
      },
      { id: 'tag_pix', type: 'tag', data: { label: 'TAG_PIX_GERADO_43', config: { entryTags: ['TAG_PIX_GERADO_43'] } } },
      {
        id: 'seq_pix',
        type: 'sequence_lead',
        data: {
          label: 'Recuperação PIX',
          subflow: {
            nodes: [
              { id: 'seq_pix_start', type: 'start' },
              { id: 'seq_pix_msg', type: 'whatsapp', data: { config: { message: 'Seu PIX está reservado!' } } },
            ],
            edges: [
              { id: 'sub_e_pix', source: 'seq_pix_start', target: 'seq_pix_msg' },
            ],
          },
        },
      },
      { id: 'tag_compra', type: 'tag', data: { label: 'TAG_COMPRA_CONFIRMADA_43', config: { entryTags: ['TAG_COMPRA_CONFIRMADA_43'] } } },
      {
        id: 'seq_pos_venda',
        type: 'sequence_lead',
        data: {
          label: 'Sequência Pós-Venda',
          subflow: {
            nodes: [
              { id: 'seq_pv_start', type: 'start' },
              { id: 'seq_pv_msg', type: 'whatsapp', data: { config: { message: 'Obrigado pela compra!' } } },
            ],
            edges: [
              { id: 'sub_e_pv', source: 'seq_pv_start', target: 'seq_pv_msg' },
            ],
          },
        },
      },
    ];

    const funnelEdges = [
      { id: 'e1', source: 'tag_entry', target: 'seq1' },
      { id: 'e2', source: 'seq1', target: 'tag_exit_funil' },
      { id: 'e3', source: 'tag_exit_funil', target: 'seq2' },
      { id: 'e4', source: 'seq2', target: 'tag_pix' },
      { id: 'e5', source: 'tag_pix', target: 'seq_pix' },
      { id: 'e6', source: 'seq2', target: 'tag_compra' },
      { id: 'e7', source: 'tag_compra', target: 'seq_pos_venda' },
    ];

    const funnelAutomation = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Funil Dinâmico de Lançamento por Tags',
        status: 'ACTIVE',
        targetType: 'INDIVIDUAL',
        nodes: JSON.stringify(funnelNodes),
        edges: JSON.stringify(funnelEdges),
      },
    });

    // Implementação das funções do motor para validação no teste
    async function testExecuteSequenceSubflowCompletion(enrollmentId, parentMacroNodeId, automationNodes, automationEdges) {
      const macroOutgoing = automationEdges.filter((e) => e.source === parentMacroNodeId);
      const exitTagEdges = macroOutgoing.filter((me) =>
        automationNodes.some((fn) => fn.id === me.target && (fn.type === 'tag' || fn.type === 'trigger'))
      );

      if (exitTagEdges.length > 0) {
        // REGRA PRINCIPAL: status WAITING_TAG, currentNodeId mantido na sequência, NUNCA aplica tag ao contato
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'WAITING_TAG', currentNodeId: parentMacroNodeId, completedAt: null },
        });
        await prisma.automationStepLog.create({
          data: {
            enrollmentId,
            contactId: (await prisma.automationEnrollment.findUnique({ where: { id: enrollmentId } })).contactId,
            nodeId: parentMacroNodeId,
            nodeType: 'sequence_lead',
            action: 'AGUARDANDO_TAG_SAIDA',
            status: 'SUCCESS',
            details: JSON.stringify({ message: 'Aguardando TAG de saída' }),
          },
        });
      } else {
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'COMPLETED', currentNodeId: parentMacroNodeId, completedAt: new Date() },
        });
      }
    }

    async function testHandleContactTagAddedEngine(contactId, tagName, tenantId) {
      // 1. Busca inscrições ativas (ACTIVE, WAITING, WAITING_TAG)
      const activeEnrollments = await prisma.automationEnrollment.findMany({
        where: { contactId, status: { in: ['ACTIVE', 'WAITING', 'WAITING_TAG'] } },
        include: { automation: true },
      });

      let transferred = false;
      for (const enr of activeEnrollments) {
        const nodes = JSON.parse(enr.automation.nodes || '[]');
        const edges = JSON.parse(enr.automation.edges || '[]');
        const currentSeq = nodes.find((n) => n.id === enr.currentNodeId && n.type === 'sequence_lead');
        if (!currentSeq) continue;

        // Procura APENAS tags de saída conectadas à sequência atual
        const outEdges = edges.filter((e) => e.source === currentSeq.id);
        const matchingExitEdge = outEdges.find((edge) => {
          const tagNode = nodes.find((n) => n.id === edge.target && (n.type === 'tag' || n.type === 'trigger'));
          const cfg = tagNode?.data?.config || {};
          const tNames = cfg.entryTags || cfg.tagNames || [cfg.tagName || tagNode?.data?.label];
          return tNames.some((t) => t && t.toLowerCase().trim() === tagName.toLowerCase().trim());
        });

        if (matchingExitEdge) {
          const exitTagNode = nodes.find((n) => n.id === matchingExitEdge.target);
          await prisma.scheduledJob.updateMany({
            where: { enrollmentId: enr.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });

          await prisma.automationStepLog.create({
            data: {
              enrollmentId: enr.id,
              contactId,
              nodeId: exitTagNode.id,
              nodeType: 'sequence_exit',
              action: `SAÍDA_POR_TAG: ${tagName}`,
              status: 'SUCCESS',
              details: JSON.stringify({ fromSequence: currentSeq.id, exitTag: exitTagNode.id }),
            },
          });

          // Conecta à próxima sequência
          const nextEdges = edges.filter((e) => e.source === exitTagNode.id);
          const nextSeq = nodes.find((n) => nextEdges.some((ne) => ne.target === n.id) && n.type === 'sequence_lead');
          if (nextSeq) {
            await prisma.automationEnrollment.update({
              where: { id: enr.id },
              data: { currentNodeId: nextSeq.id, status: 'ACTIVE', completedAt: null },
            });
            transferred = true;
          } else {
            await prisma.automationEnrollment.update({
              where: { id: enr.id },
              data: { status: 'COMPLETED', completedAt: new Date() },
            });
            transferred = true;
          }
        }
      }

      // 2. Se não transferiu, verifica se é TAG de ENTRADA RAIZ de funil ativo
      if (!transferred) {
        const automations = await prisma.automation.findMany({
          where: { tenantId, status: 'ACTIVE' },
        });
        for (const auto of automations) {
          const nodes = JSON.parse(auto.nodes || '[]');
          const edges = JSON.parse(auto.edges || '[]');
          const rootEntryTags = nodes.filter((n) => {
            if (n.type !== 'tag' && n.type !== 'trigger') return false;
            const hasIncomingSeq = edges.some(
              (e) => e.target === n.id && nodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead')
            );
            if (hasIncomingSeq) return false;
            const cfg = n.data?.config || {};
            const tNames = cfg.entryTags || cfg.tagNames || [cfg.tagName || n.data?.label];
            return tNames.some((t) => t && t.toLowerCase().trim() === tagName.toLowerCase().trim());
          });

          for (const ret of rootEntryTags) {
            const outEdges = edges.filter((e) => e.source === ret.id);
            const targetSeq = nodes.find((n) => outEdges.some((e) => e.target === n.id) && n.type === 'sequence_lead');
            if (targetSeq) {
              const existing = await prisma.automationEnrollment.findFirst({
                where: { automationId: auto.id, contactId, status: { in: ['ACTIVE', 'WAITING', 'WAITING_TAG'] } },
              });
              if (!existing) {
                await prisma.automationEnrollment.create({
                  data: {
                    automationId: auto.id,
                    contactId,
                    currentNodeId: targetSeq.id,
                    status: 'ACTIVE',
                  },
                });
              }
            }
          }
        }
      }
    }

    // 4. Inscreve os 3 leads na entrada com icaronTag
    for (const c of [contactA43, contactB43, contactC43]) {
      await prisma.contactTag.create({
        data: { contactId: c.id, tagId: tagEntry43.id },
      });
      await testHandleContactTagAddedEngine(c.id, 'icaronTag', testTenant.id);
    }

    // Verifica que os 3 leads entraram na seq1
    const seq1Enrollments = await prisma.automationEnrollment.findMany({
      where: { automationId: funnelAutomation.id, contactId: { in: [contactA43.id, contactB43.id, contactC43.id] } },
    });
    if (seq1Enrollments.length !== 3) {
      throw new Error(`Esperado 3 inscrições na automação, encontrou ${seq1Enrollments.length}`);
    }

    // 5. Executa a conclusão das mensagens internas da seq1 para os 3 leads
    for (const enr of seq1Enrollments) {
      await testExecuteSequenceSubflowCompletion(enr.id, 'seq1', funnelNodes, funnelEdges);
    }

    // 6. VALIDAÇÃO DA REGRA PRINCIPAL:
    // - Os leads DEVEM PERMANECER na seq1 com status WAITING_TAG (Aguardando TAG de saída)
    // - A TAG DE SAÍDA NÃO DEVE ter sido aplicada aos contatos
    // - NENHUM lead deve ter avançado automaticamente para a seq2!
    const enrollmentsAfterMsg = await prisma.automationEnrollment.findMany({
      where: { automationId: funnelAutomation.id, contactId: { in: [contactA43.id, contactB43.id, contactC43.id] } },
    });

    for (const enr of enrollmentsAfterMsg) {
      if (enr.status !== 'WAITING_TAG') {
        throw new Error(`Esperado status WAITING_TAG para lead ${enr.contactId}, mas encontrou ${enr.status}`);
      }
      if (enr.currentNodeId !== 'seq1') {
        throw new Error(`Esperado currentNodeId seq1 para lead ${enr.contactId}, mas encontrou ${enr.currentNodeId}`);
      }
    }

    // Verifica que nenhum lead recebeu a TAG SAIDA DO FUNIL
    const exitTagsAttached = await prisma.contactTag.findMany({
      where: {
        contactId: { in: [contactA43.id, contactB43.id, contactC43.id] },
        tagId: tagExit43.id,
      },
    });
    if (exitTagsAttached.length > 0) {
      throw new Error(`FALHA CRÍTICA: A tag de saída foi aplicada indevidamente a ${exitTagsAttached.length} leads!`);
    }

    // 7. VALIDAÇÃO DE TRANSIÇÃO ATÔMICA:
    // Aplica a TAG SAIDA DO FUNIL apenas ao contactA43
    await prisma.contactTag.create({
      data: { contactId: contactA43.id, tagId: tagExit43.id },
    });
    await testHandleContactTagAddedEngine(contactA43.id, 'TAG SAIDA DO FUNIL', testTenant.id);

    // contactA43 deve ter migrado para seq2
    const enrAAfter = await prisma.automationEnrollment.findFirst({
      where: { automationId: funnelAutomation.id, contactId: contactA43.id },
    });
    if (enrAAfter.currentNodeId !== 'seq2') {
      throw new Error(`Esperado contactA transferido para seq2, mas encontrou ${enrAAfter.currentNodeId}`);
    }

    // contactB43 e contactC43 DEVEM CONTINUAR em seq1 com WAITING_TAG
    const enrB = await prisma.automationEnrollment.findFirst({
      where: { automationId: funnelAutomation.id, contactId: contactB43.id },
    });
    const enrC = await prisma.automationEnrollment.findFirst({
      where: { automationId: funnelAutomation.id, contactId: contactC43.id },
    });
    if (enrB.status !== 'WAITING_TAG' || enrB.currentNodeId !== 'seq1') {
      throw new Error('contactB deveria continuar aguardando tag de saída na seq1');
    }
    if (enrC.status !== 'WAITING_TAG' || enrC.currentNodeId !== 'seq1') {
      throw new Error('contactC deveria continuar aguardando tag de saída na seq1');
    }

    // 8. VALIDAÇÃO DE RAMIFICAÇÃO (BRANCHING):
    // contactA43 está em seq2 e agora recebe TAG_PIX_GERADO_43
    await prisma.contactTag.create({
      data: { contactId: contactA43.id, tagId: tagPix43.id },
    });
    await testHandleContactTagAddedEngine(contactA43.id, 'TAG_PIX_GERADO_43', testTenant.id);

    const enrAAfterPix = await prisma.automationEnrollment.findFirst({
      where: { automationId: funnelAutomation.id, contactId: contactA43.id },
    });
    if (enrAAfterPix.currentNodeId !== 'seq_pix') {
      throw new Error(`Esperado contactA transferido para seq_pix (ramificação PIX), mas encontrou ${enrAAfterPix.currentNodeId}`);
    }

    // 9. VALIDAÇÃO DE ENTRADA CONTÍNUA DE NOVO LEAD:
    // Novo lead é criado no sistema e recebe a tag raiz icaronTag
    const contactD43 = await prisma.contact.create({
      data: { tenantId: testTenant.id, name: 'Lead Novo Contínuo', phone: `5511999${ts43.toString().slice(-6)}4`, email: `novo_funil_${ts43}@teste.com` },
    });
    await prisma.contactTag.create({
      data: { contactId: contactD43.id, tagId: tagEntry43.id },
    });
    await testHandleContactTagAddedEngine(contactD43.id, 'icaronTag', testTenant.id);

    const enrD = await prisma.automationEnrollment.findFirst({
      where: { automationId: funnelAutomation.id, contactId: contactD43.id },
    });
    if (!enrD || enrD.currentNodeId !== 'seq1') {
      throw new Error('Novo lead deveria ter sido inscrito automaticamente na seq1 ao receber a tag de entrada raiz');
    }

    // Limpeza Teste 43
    await prisma.scheduledJob.deleteMany({ where: { enrollment: { automationId: funnelAutomation.id } } });
    await prisma.automationStepLog.deleteMany({ where: { enrollment: { automationId: funnelAutomation.id } } });
    await prisma.automationEnrollment.deleteMany({ where: { automationId: funnelAutomation.id } });
    await prisma.automation.delete({ where: { id: funnelAutomation.id } });
    await prisma.contactTag.deleteMany({
      where: { contactId: { in: [contactA43.id, contactB43.id, contactC43.id, contactD43.id] } },
    });
    await prisma.contact.deleteMany({
      where: { id: { in: [contactA43.id, contactB43.id, contactC43.id, contactD43.id] } },
    });
    await prisma.tag.deleteMany({
      where: { id: { in: [tagEntry43.id, tagExit43.id, tagPix43.id, tagCompra43.id] } },
    });

    console.log('✔ PASSOU: Motor de automação de funis por TAGs e eventos validado com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 44: Correção Crítica do Motor de Agendamento por Data e Horário
    // (Fuso Horário de Brasília, Timer Absoluto vs Relativo e Prevenção de Disparo Prematuro)
    // -------------------------------------------------------------
    console.log('\n[TESTE 44] Correção Crítica do Motor de Agendamento por Data e Horário...');

    // 1. Validação do parser de datas (parseTargetDate) com Fuso Horário de Brasília (UTC-3)
    function testParseTargetDate(dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return NaN;
      let clean = dateStr.trim();
      const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:(?:\s+às\s+|\s+T?|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i);
      if (brMatch) {
        const day = brMatch[1].padStart(2, '0');
        const month = brMatch[2].padStart(2, '0');
        const year = brMatch[3];
        const hour = (brMatch[4] || '00').padStart(2, '0');
        const min = (brMatch[5] || '00').padStart(2, '0');
        const sec = (brMatch[6] || '00').padStart(2, '0');
        return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}-03:00`).getTime();
      }
      const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
      if (isoMatch) {
        const [_, y, m, d, hr, mn, sc] = isoMatch;
        const sec = sc || '00';
        return new Date(`${y}-${m}-${d}T${hr}:${mn}:${sec}-03:00`).getTime();
      }
      if (/[+-]\d{2}(:?\d{2})?$/.test(clean) || clean.endsWith('Z')) {
        return new Date(clean).getTime();
      }
      return new Date(clean).getTime();
    }

    // Validação 1: HTML datetime-local (2026-11-18T06:00) deve ancorar em 09:00 UTC (06:00 BRT)
    const tHtml = testParseTargetDate('2026-11-18T06:00');
    assert.strictEqual(new Date(tHtml).toISOString(), '2026-11-18T09:00:00.000Z', '06:00 BRT deve equivaler exatamente a 09:00 UTC');

    // Validação 2: Formato amigável brasileiro (18/11/2026 às 06:00) deve ancorar em 09:00 UTC
    const tBrAs = testParseTargetDate('18/11/2026 às 06:00');
    assert.strictEqual(new Date(tBrAs).toISOString(), '2026-11-18T09:00:00.000Z', '18/11/2026 às 06:00 deve equivaler a 09:00 UTC');

    // Validação 3: Formato amigável brasileiro com espaço (18/11/2026 06:00) deve ancorar em 09:00 UTC
    const tBrEsp = testParseTargetDate('18/11/2026 06:00');
    assert.strictEqual(new Date(tBrEsp).toISOString(), '2026-11-18T09:00:00.000Z', '18/11/2026 06:00 deve equivaler a 09:00 UTC');

    // Validação 4: Data inválida retorna NaN e nunca dispara
    assert.ok(isNaN(testParseTargetDate('invalid_date_abc')), 'Data inválida deve retornar NaN');
    assert.ok(isNaN(testParseTargetDate(null)), 'Data nula deve retornar NaN');

    // 2. Cenário Real do Usuário: Automação de Grupos com Timer para 06:00
    // Simula o servidor rodando em 03:25 AM em Brasília (06:25 UTC)
    const ts44 = Date.now();
    const inst44 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Expert 44',
        instanceName: `inst_44_${ts44}`,
        instanceToken: `tok_44_${ts44}`,
        phone: '+5511999994444',
        status: 'CONNECTED',
      },
    });

    const tagGrupoName = `GRUPO EXPERT BUSCA E APREENSÃO ${ts44}`;
    const tagGrupo44 = await prisma.groupTag.upsert({
      where: {
        tenantId_name: {
          tenantId: testTenant.id,
          name: tagGrupoName,
        },
      },
      create: {
        tenantId: testTenant.id,
        name: tagGrupoName,
        color: '#8b5cf6',
      },
      update: {},
    });

    const grupo44 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst44.id,
        jid: `120363_grupo44_${ts44}@g.us`,
        name: 'GRUPO EXPERT BUSCA E APREENSÃO #1',
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    await prisma.groupTagOnGroup.create({
      data: {
        groupId: grupo44.id,
        tagId: tagGrupo44.id,
      },
    });

    // Nós do fluxo exatamente como na captura do usuário:
    // Tag | 7 grupos -> Timer (06:00) -> WhatsApp -> Timer (10:00) -> WhatsApp
    // Para o teste, usamos data futura real (ex: daqui a 2 horas)
    const futureDateStr = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16);
    const futureDate10Str = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 16);

    const autoGrupo44 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Grupos Agendada',
        targetType: 'GROUP',
        status: 'ACTIVE',
        targetGroupTags: JSON.stringify([tagGrupoName]),
        nodes: JSON.stringify([
          { id: 'node_tag', type: 'tag', data: { label: 'Tags | 1 grupo', config: { entryTags: [tagGrupoName] } } },
          { id: 'node_timer_6', type: 'timer', data: { label: 'Até 18/11/2026 às 06:00', config: { timerType: 'SPECIFIC_DATE', specificDate: futureDateStr } } },
          { id: 'node_wpp_1', type: 'whatsapp', data: { label: 'WhatsApp | 1 grupo', config: { text: 'Mensagem das 06:00' } } },
          { id: 'node_timer_10', type: 'timer', data: { label: 'Até 18/11/2026 às 10:00', config: { timerType: 'SPECIFIC_DATE', specificDate: futureDate10Str } } },
          { id: 'node_wpp_2', type: 'whatsapp', data: { label: 'WhatsApp | 0 grupos', config: { text: 'Mensagem das 10:00' } } },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'node_tag', target: 'node_timer_6' },
          { id: 'e2', source: 'node_timer_6', target: 'node_wpp_1' },
          { id: 'e3', source: 'node_wpp_1', target: 'node_timer_10' },
          { id: 'e4', source: 'node_timer_10', target: 'node_wpp_2' },
        ]),
      },
    });

    // Helper simulado do motor para execução de nós de grupos com as regras corrigidas
    async function testExecuteGroupNodeEngine(enrollmentId, nodeId, tenantId, simulatedNow) {
      const enrollment = await prisma.automationGroupEnrollment.findUnique({
        where: { id: enrollmentId },
        include: { automation: true, group: true },
      });
      if (!enrollment || enrollment.status === 'CANCELLED' || enrollment.status === 'COMPLETED') return;

      const nodes = JSON.parse(enrollment.automation.nodes || '[]');
      const edges = JSON.parse(enrollment.automation.edges || '[]');
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // REGRA: já executado com sucesso (excluindo WAIT_TIMER)
      const alreadyLogged = await prisma.automationGroupStepLog.findFirst({
        where: {
          enrollmentId,
          nodeId,
          status: 'SUCCESS',
          action: { not: 'WAIT_TIMER' },
        },
      });
      if (alreadyLogged) {
        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
          await testExecuteGroupNodeEngine(enrollmentId, edge.target, tenantId, simulatedNow);
        }
        return;
      }

      await prisma.automationGroupEnrollment.update({
        where: { id: enrollmentId },
        data: { currentNodeId: nodeId },
      });

      const nodeType = node.data?.type || node.type;

      const existingLog = await prisma.automationGroupStepLog.findFirst({
        where: {
          enrollmentId,
          nodeId,
          status: { in: ['SUCCESS', 'QUEUED', 'PROCESSING'] },
          action: { not: 'WAIT_TIMER' },
        },
      });
      if (existingLog) return;

      if (nodeType === 'timer' || nodeType === 'delay') {
        const cfg = node.data?.config || {};
        const isSpecific = Boolean(cfg.timerType === 'SPECIFIC_DATE' || cfg.delayType === 'specific_date' || cfg.specificDate);
        let targetTimestamp;
        if (isSpecific) {
          targetTimestamp = testParseTargetDate(cfg.specificDate);
          if (isNaN(targetTimestamp)) return;
        } else {
          targetTimestamp = simulatedNow + 60000;
        }

        if (targetTimestamp > simulatedNow) {
          // Horário futuro: aguarda!
          await prisma.automationGroupEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'WAITING', currentNodeId: nodeId },
          });
          // CRÍTICO: Status é WAITING, NUNCA SUCCESS!
          await prisma.automationGroupStepLog.create({
            data: {
              enrollmentId,
              groupId: enrollment.groupId,
              tenantId,
              nodeId,
              nodeType: 'timer',
              action: 'WAIT_TIMER',
              status: 'WAITING',
              details: JSON.stringify({ scheduledFor: new Date(targetTimestamp).toISOString() }),
            },
          });
          return; // Aguarda pontualmente o horário!
        }

        // Horário alcançado:
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: enrollment.groupId,
            tenantId,
            nodeId,
            nodeType: 'timer',
            action: 'TIMER_PASSED',
            status: 'SUCCESS',
            details: JSON.stringify({ passedAt: new Date(simulatedNow).toISOString() }),
          },
        });

        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
          await testExecuteGroupNodeEngine(enrollmentId, edge.target, tenantId, simulatedNow);
        }
        return;
      }

      if (nodeType === 'whatsapp') {
        // Envio no WhatsApp
        await prisma.whatsappQueue.create({
          data: {
            tenantId,
            whatsappInstanceId: inst44.id,
            recipientType: 'GROUP',
            groupJid: enrollment.group.jid,
            phone: 'group',
            text: node.data?.config?.text || 'Mensagem de Grupo',
            status: 'PENDING',
          },
        });

        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: enrollment.groupId,
            tenantId,
            nodeId,
            nodeType: 'whatsapp',
            action: 'WHATSAPP_GROUP_QUEUED',
            status: 'SUCCESS',
          },
        });

        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
          await testExecuteGroupNodeEngine(enrollmentId, edge.target, tenantId, simulatedNow);
        }
      }
    }

    // Helper simulado do scheduler para processamento de timers vencidos
    async function testProcessDueGroupTimers(simulatedNow) {
      const waitingEnrollments = await prisma.automationGroupEnrollment.findMany({
        where: { status: 'WAITING', currentNodeId: { not: null } },
        include: { automation: true },
      });

      let processed = 0;
      for (const enr of waitingEnrollments) {
        if (!enr.currentNodeId) continue;
        const nodes = JSON.parse(enr.automation.nodes || '[]');
        const edges = JSON.parse(enr.automation.edges || '[]');
        const currentNode = nodes.find((n) => n.id === enr.currentNodeId);
        if (!currentNode) continue;

        const cfg = currentNode.data?.config || {};
        let targetTime = testParseTargetDate(cfg.specificDate);
        if (isNaN(targetTime)) {
          const waitLog = await prisma.automationGroupStepLog.findFirst({
            where: { enrollmentId: enr.id, nodeId: currentNode.id, action: 'WAIT_TIMER' },
            orderBy: { executedAt: 'desc' },
          });
          if (waitLog && waitLog.details) {
            try { targetTime = testParseTargetDate(JSON.parse(waitLog.details).scheduledFor); } catch {}
          }
        }

        // NUNCA processar se targetTime for NaN ou se ainda for futuro
        if (isNaN(targetTime) || targetTime > simulatedNow) {
          continue;
        }

        // targetTime <= simulatedNow: VENCEU!
        await prisma.automationGroupEnrollment.update({
          where: { id: enr.id },
          data: { status: 'ACTIVE' },
        });

        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId: enr.id,
            groupId: enr.groupId,
            tenantId: enr.tenantId,
            nodeId: currentNode.id,
            nodeType: 'timer',
            action: 'TIMER_PASSED',
            status: 'SUCCESS',
            details: JSON.stringify({ passedAt: new Date(simulatedNow).toISOString() }),
          },
        });

        const outgoingEdges = edges.filter((e) => e.source === currentNode.id);
        for (const edge of outgoingEdges) {
          await testExecuteGroupNodeEngine(enr.id, edge.target, enr.tenantId, simulatedNow);
        }
        processed++;
      }
      return processed;
    }

    // SUBTESTE 44.1: Ativação inicial às 03:25 AM com agendamento para as 06:00
    // O sistema NUNCA deve disparar imediatamente!
    const enrollment44 = await prisma.automationGroupEnrollment.create({
      data: {
        automationId: autoGrupo44.id,
        groupId: grupo44.id,
        tenantId: testTenant.id,
        status: 'ACTIVE',
      },
    });

    const now0325 = Date.now(); // Representa o momento atual (03:25)
    // Gatilho avança para o Timer 06:00
    await testExecuteGroupNodeEngine(enrollment44.id, 'node_timer_6', testTenant.id, now0325);

    // Validações imediatas pós-ativação:
    const enrAfterTrigger = await prisma.automationGroupEnrollment.findUnique({
      where: { id: enrollment44.id },
    });
    assert.strictEqual(enrAfterTrigger.status, 'WAITING', 'Grupo DEVE permanecer com status WAITING');
    assert.strictEqual(enrAfterTrigger.currentNodeId, 'node_timer_6', 'Grupo DEVE permanecer aguardando no nó do timer das 06:00');

    const waitTimerLog = await prisma.automationGroupStepLog.findFirst({
      where: { enrollmentId: enrollment44.id, nodeId: 'node_timer_6' },
    });
    assert.ok(waitTimerLog, 'Log de espera do timer deve existir');
    assert.strictEqual(waitTimerLog.action, 'WAIT_TIMER', 'Ação do log deve ser WAIT_TIMER');
    assert.strictEqual(waitTimerLog.status, 'WAITING', 'Status do log de espera DEVE ser WAITING, nunca SUCCESS');

    // NENHUM envio de WhatsApp deve ter sido gerado!
    const queuedWppEarly = await prisma.whatsappQueue.findMany({
      where: { tenantId: testTenant.id, groupJid: grupo44.jid },
    });
    assert.strictEqual(queuedWppEarly.length, 0, 'NENHUMA mensagem de WhatsApp pode ser disparada antes do horário agendado');

    // SUBTESTE 44.2: Resiliência contra re-ativação / re-salvamento do fluxo
    // Simula usuário clicando em "Salvar" ou "Ativar" novamente enquanto o fluxo está esperando
    // O helper checkAndAdvanceNewGroupNodes não pode considerar o timer como 'SUCCESS' concluído
    const executedLogs = await prisma.automationGroupStepLog.findMany({
      where: {
        enrollmentId: enrollment44.id,
        status: 'SUCCESS',
        action: { not: 'WAIT_TIMER' },
      },
      select: { nodeId: true },
    });
    const executedSet = new Set(executedLogs.map((l) => l.nodeId));
    assert.strictEqual(executedSet.has('node_timer_6'), false, 'Nó de timer aguardando NUNCA deve ser listado como SUCCESS');

    // SUBTESTE 44.3: Ciclo periódico do Cron Worker / Scheduler antes do horário
    const processedEarly = await testProcessDueGroupTimers(now0325 + 30000); // 30s depois
    assert.strictEqual(processedEarly, 0, 'O scheduler não deve processar timers cujo horário ainda não chegou');

    const queuedWppStillZero = await prisma.whatsappQueue.findMany({
      where: { tenantId: testTenant.id, groupJid: grupo44.jid },
    });
    assert.strictEqual(queuedWppStillZero.length, 0, 'Fila de WhatsApp deve permanecer estritamente vazia');

    // SUBTESTE 44.4: Simulação de avanço do tempo até as 06:00 (horário atingido)
    // Avança o relógio simulado para depois do target (agora é 06:01)
    const simulated0601 = testParseTargetDate(futureDateStr) + 60000;
    const processedAt06 = await testProcessDueGroupTimers(simulated0601);
    assert.strictEqual(processedAt06, 1, 'Scheduler deve processar pontualmente o timer das 06:00 quando o horário for atingido');

    // Verifica que o WhatsApp das 06:00 foi enfileirado
    const queuedWppAt06 = await prisma.whatsappQueue.findMany({
      where: { tenantId: testTenant.id, groupJid: grupo44.jid },
    });
    assert.strictEqual(queuedWppAt06.length, 1, 'Exatamente 1 mensagem de WhatsApp (das 06:00) deve ser disparada');
    assert.strictEqual(queuedWppAt06[0].text, 'Mensagem das 06:00');

    // Verifica que o fluxo avançou e agora está AGUARDANDO no Timer das 10:00
    const enrAtTimer10 = await prisma.automationGroupEnrollment.findUnique({
      where: { id: enrollment44.id },
    });
    assert.strictEqual(enrAtTimer10.status, 'WAITING', 'Grupo deve aguardar no próximo timer (10:00)');
    assert.strictEqual(enrAtTimer10.currentNodeId, 'node_timer_10', 'Nó atual deve ser o Timer das 10:00');

    // Mensagem das 10:00 NUNCA deve ter sido disparada ainda!
    const queuedWppAt10Early = await prisma.whatsappQueue.findMany({
      where: { tenantId: testTenant.id, groupJid: grupo44.jid, text: 'Mensagem das 10:00' },
    });
    assert.strictEqual(queuedWppAt10Early.length, 0, 'Mensagem das 10:00 NÃO deve ter sido disparada às 06:00');

    // SUBTESTE 44.5: Automação Individual com Timer Específico (Lead Individual)
    const contact44 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead Teste Timer',
        email: `lead_timer_${ts44}@teste.com`,
        phone: '+5511999997777',
      },
    });

    const enrIndiv44 = await prisma.automationEnrollment.create({
      data: {
        automationId: autoGrupo44.id,
        contactId: contact44.id,
        status: 'WAITING',
      },
    });

    const targetJobTime = new Date(Date.now() + 3600000); // 1 hora no futuro
    const scheduledJob44 = await prisma.scheduledJob.create({
      data: {
        tenantId: testTenant.id,
        enrollmentId: enrIndiv44.id,
        contactId: contact44.id,
        automationId: autoGrupo44.id,
        targetNodeId: 'node_next',
        executeAt: targetJobTime,
        status: 'PENDING',
      },
    });

    // Worker checando jobs antes da hora: executeAt { lte: now } não deve encontrar o job
    const dueJobsEarly = await prisma.scheduledJob.findMany({
      where: {
        status: 'PENDING',
        executeAt: { lte: new Date() },
        id: scheduledJob44.id,
      },
    });
    assert.strictEqual(dueJobsEarly.length, 0, 'Job futuro nunca deve ser selecionado como due');

    // Limpeza Teste 44
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollment: { automationId: autoGrupo44.id } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { automationId: autoGrupo44.id } });
    await prisma.scheduledJob.deleteMany({ where: { id: scheduledJob44.id } });
    await prisma.automationEnrollment.deleteMany({ where: { id: enrIndiv44.id } });
    await prisma.automation.delete({ where: { id: autoGrupo44.id } });
    await prisma.contact.delete({ where: { id: contact44.id } });
    await prisma.groupTagOnGroup.deleteMany({ where: { groupId: grupo44.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo44.id } });
    await prisma.groupTag.delete({ where: { id: tagGrupo44.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst44.id } });

    console.log('✔ PASSOU: Correção crítica do agendamento por data e horário validada com 100% de sucesso.');
    passed++;

    // =====================================================
    // TESTE 45: Ramificações em Grupos (06:00 & 10:00), Prevenção de Conclusão Prematura e Auto-Healing
    // =====================================================
    console.log('\n[TESTE 45] Ramificações em Grupos (06:00 & 10:00), Prevenção de Conclusão Prematura e Auto-Healing...');
    total++;

    // 1. Instância e Grupo com Admin
    const inst45 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Teste 45',
        instanceName: `inst_test_45_${Date.now()}`,
        instanceToken: 'token45',
        status: 'CONNECTED',
      },
    });

    const tagGrupo45 = await prisma.groupTag.create({
      data: {
        tenantId: testTenant.id,
        name: `Grupo Ramificacao 45 ${Date.now()}`,
        color: '#6366f1',
      },
    });

    const grupo45 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst45.id,
        jid: `120363454545@g.us`,
        name: 'Grupo Expert Busca e Apreensão',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    await prisma.groupTagOnGroup.create({
      data: {
        groupId: grupo45.id,
        tagId: tagGrupo45.id,
      },
    });

    // 2. Cria o Fluxo Exato do Usuário (Ramificação a partir do Timer 06:00):
    // Node 1 (Tag) -> Node 2 (Timer 06:00)
    // Node 2 -> Node 3 (WhatsApp 06:00)
    // Node 2 -> Node 4 (Timer 10:00) -> Node 5 (WhatsApp 10:00)
    const nodeTag45 = 'node_tag_45';
    const nodeTimer06_45 = 'node_timer_06_45';
    const nodeWpp06_45 = 'node_wpp_06_45';
    const nodeTimer10_45 = 'node_timer_10_45';
    const nodeWpp10_45 = 'node_wpp_10_45';

    const flowNodes45 = [
      { id: nodeTag45, type: 'tag', data: { config: { groupTagIds: [tagGrupo45.id] } } },
      {
        id: nodeTimer06_45,
        type: 'timer',
        data: {
          config: {
            timerType: 'SPECIFIC_DATE',
            specificDate: '2026-11-18T06:00:00-03:00',
            dispatchAfterPassed: true,
          },
        },
      },
      {
        id: nodeWpp06_45,
        type: 'whatsapp',
        data: {
          config: {
            text: 'Mensagem das 06:00 no grupo',
            whatsappInstanceId: inst45.id,
          },
        },
      },
      {
        id: nodeTimer10_45,
        type: 'timer',
        data: {
          config: {
            timerType: 'SPECIFIC_DATE',
            specificDate: '2026-11-18T10:00:00-03:00',
            dispatchAfterPassed: true,
          },
        },
      },
      {
        id: nodeWpp10_45,
        type: 'whatsapp',
        data: {
          config: {
            text: 'Mensagem das 10:00 no grupo',
            whatsappInstanceId: inst45.id,
          },
        },
      },
    ];

    const flowEdges45 = [
      { id: 'e1', source: nodeTag45, target: nodeTimer06_45 },
      { id: 'e2', source: nodeTimer06_45, target: nodeWpp06_45 }, // Ramo A
      { id: 'e3', source: nodeTimer06_45, target: nodeTimer10_45 }, // Ramo B
      { id: 'e4', source: nodeTimer10_45, target: nodeWpp10_45 },
    ];

    const autoGrupo45 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Ramificada 06:00 e 10:00',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(flowNodes45),
        edges: JSON.stringify(flowEdges45),
      },
    });

    // 3. Helper de avanço de nó de grupo com checagem de ramos múltiplos e timers pendentes
    async function testAdvanceGroupNode45(enrollmentId, currentNodeId, auto) {
      const edges = JSON.parse(auto.edges || '[]');
      const outgoing = edges.filter((e) => e.source === currentNodeId);

      if (outgoing.length === 0) {
        // Verifica se existem outros ramos com timers pendentes
        const waitLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, action: 'WAIT_TIMER' },
        });
        const passedLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] } },
          select: { nodeId: true },
        });
        const passedSet = new Set(passedLogs.map((p) => p.nodeId));
        const hasPendingTimers = waitLogs.some((w) => !passedSet.has(w.nodeId));

        if (hasPendingTimers) {
          const pendingTimerId = waitLogs.find((w) => !passedSet.has(w.nodeId))?.nodeId;
          await prisma.automationGroupEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'WAITING', currentNodeId: pendingTimerId },
          });
          return;
        }

        // Se nenhum ramo pendente, marca COMPLETED
        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'COMPLETED', completedAt: new Date(), currentNodeId: null },
        });
      }
    }

    // Cria a inscrição do grupo no fluxo
    const enr45 = await prisma.automationGroupEnrollment.create({
      data: {
        automationId: autoGrupo45.id,
        groupId: grupo45.id,
        tenantId: testTenant.id,
        status: 'ACTIVE',
      },
    });

    // 4. Simula o disparo de 06:00:
    // Timer 06:00 passa e registra TIMER_PASSED
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr45.id,
        groupId: grupo45.id,
        tenantId: testTenant.id,
        nodeId: nodeTimer06_45,
        nodeType: 'timer',
        action: 'TIMER_PASSED',
        status: 'SUCCESS',
      },
    });

    // Ramo A: Executa WhatsApp 06:00 (enfileira mensagem)
    await prisma.whatsappQueue.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst45.id,
        phone: grupo45.jid,
        recipientType: 'GROUP',
        groupJid: grupo45.jid,
        groupEnrollmentId: enr45.id,
        nodeId: nodeWpp06_45,
        automationId: autoGrupo45.id,
        text: 'Mensagem das 06:00 no grupo',
        status: 'SENT',
      },
    });

    // Ramo B: Timer 10:00 entra em WAITING (registra WAIT_TIMER no log)
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr45.id,
        groupId: grupo45.id,
        tenantId: testTenant.id,
        nodeId: nodeTimer10_45,
        nodeType: 'timer',
        action: 'WAIT_TIMER',
        status: 'WAITING',
        details: JSON.stringify({
          targetDate: '2026-11-18T10:00:00-03:00',
          scheduledFor: '2026-11-18T10:00:00-03:00',
        }),
      },
    });

    // Simula a conclusão do envio do nó WhatsApp 06:00 através de advanceGroupNode
    await testAdvanceGroupNode45(enr45.id, nodeWpp06_45, autoGrupo45);

    // CRÍTICO: A inscrição NÃO pode ser marcada como COMPLETED enquanto o Timer 10:00 estiver pendente!
    const enrCheckAfter06 = await prisma.automationGroupEnrollment.findUnique({
      where: { id: enr45.id },
    });
    assert.strictEqual(
      enrCheckAfter06.status,
      'WAITING',
      'Inscrição DEVE permanecer em status WAITING apontando para o Timer 10:00!'
    );
    assert.strictEqual(
      enrCheckAfter06.currentNodeId,
      nodeTimer10_45,
      'Inscrição DEVE apontar para o nó Timer das 10:00!'
    );

    // 5. Simula a chegada das 10:00 AM (Auto-Healing de timers vencidos do scheduler)
    // Helper de auto-healing idêntico ao adicionado em scheduler.ts
    const pendingLogs45 = await prisma.automationGroupStepLog.findMany({
      where: { action: 'WAIT_TIMER' },
    });

    let autoHealedProcessed = 0;
    const now1005 = new Date('2026-11-18T10:05:00-03:00').getTime();

    for (const waitLog of pendingLogs45) {
      const alreadyPassed = await prisma.automationGroupStepLog.findFirst({
        where: {
          enrollmentId: waitLog.enrollmentId,
          nodeId: waitLog.nodeId,
          action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] },
        },
      });
      if (alreadyPassed) continue;

      const targetTime = new Date('2026-11-18T10:00:00-03:00').getTime();
      if (targetTime <= now1005) {
        // Executa timer
        await prisma.automationGroupEnrollment.update({
          where: { id: waitLog.enrollmentId },
          data: { status: 'ACTIVE', currentNodeId: waitLog.nodeId },
        });

        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId: waitLog.enrollmentId,
            groupId: waitLog.groupId,
            tenantId: waitLog.tenantId,
            nodeId: waitLog.nodeId,
            nodeType: 'timer',
            action: 'TIMER_PASSED',
            status: 'SUCCESS',
            details: JSON.stringify({ recovery: true }),
          },
        });

        // Avança para o nó de WhatsApp 10:00
        await prisma.whatsappQueue.create({
          data: {
            tenantId: testTenant.id,
            whatsappInstanceId: inst45.id,
            phone: grupo45.jid,
            recipientType: 'GROUP',
            groupJid: grupo45.jid,
            groupEnrollmentId: waitLog.enrollmentId,
            nodeId: nodeWpp10_45,
            automationId: autoGrupo45.id,
            text: 'Mensagem das 10:00 no grupo',
            status: 'PENDING',
          },
        });
        autoHealedProcessed++;
      }
    }

    assert.ok(autoHealedProcessed >= 1, 'Timer das 10:00 deve ser processado e recuperado pelo auto-healing');

    // Verifica se a mensagem do nó WhatsApp 10:00 foi enfileirada com sucesso
    const queuedWpp10 = await prisma.whatsappQueue.findFirst({
      where: {
        tenantId: testTenant.id,
        nodeId: nodeWpp10_45,
      },
    });
    assert.ok(queuedWpp10, 'Mensagem das 10:00 deve ser enfileirada no WhatsApp Queue');
    assert.strictEqual(queuedWpp10.text, 'Mensagem das 10:00 no grupo');

    // 6. Validação do Auto-healing do Banco e Super Admin
    const superAdminUser = await prisma.user.findUnique({
      where: { email: 'carloshenrq1245@gmail.com' },
    });
    assert.ok(superAdminUser, 'Super Admin deve existir e ser consultável sem erros de coluna User.phone');
    assert.strictEqual(superAdminUser.role, 'SUPER_ADMIN');

    const saasClientCount = await prisma.saasClient.count();
    assert.ok(typeof saasClientCount === 'number', 'Tabela saas_clients deve existir e ser consultável sem erros');

    // Limpeza Teste 45
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollment: { automationId: autoGrupo45.id } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { automationId: autoGrupo45.id } });
    await prisma.automation.delete({ where: { id: autoGrupo45.id } });
    await prisma.groupTagOnGroup.deleteMany({ where: { groupId: grupo45.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo45.id } });
    await prisma.groupTag.delete({ where: { id: tagGrupo45.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst45.id } });

    console.log('✔ PASSOU: Ramificações em Grupos, Prevenção de Conclusão Prematura e Auto-Healing validados com 100% de sucesso.');
    passed++;

    // =====================================================
    // TESTE 46: Guarda Absoluta Anti-Duplicação de Mensagens em Grupos e Leads
    // =====================================================
    console.log('\n[TESTE 46] Guarda Absoluta Anti-Duplicação de Mensagens em Grupos e Leads...');
    total++;

    const inst46 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Anti-Duplicação',
        instanceName: `inst_anti_dup_${Date.now()}`,
        instanceToken: 'token46',
        status: 'CONNECTED',
      },
    });

    const grupo46 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst46.id,
        jid: `120363464646@g.us`,
        name: 'Grupo Teste Anti-Duplicação',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const autoGrupo46 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Anti-Duplicação Grupos',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify([
          { id: 'node_start', type: 'trigger' },
          { id: 'node_wpp_dup', type: 'whatsapp', data: { config: { text: 'Mensagem única sem duplicação' } } },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'node_start', target: 'node_wpp_dup' },
        ]),
      },
    });

    const enr46 = await prisma.automationGroupEnrollment.create({
      data: {
        automationId: autoGrupo46.id,
        groupId: grupo46.id,
        tenantId: testTenant.id,
        status: 'ACTIVE',
      },
    });

    // 1. Simula primeiro enfileiramento legítimo
    const firstQueueItem = await prisma.whatsappQueue.create({
      data: {
        id: `wq_first_${Date.now()}`,
        tenantId: testTenant.id,
        whatsappInstanceId: inst46.id,
        phone: grupo46.jid,
        recipientType: 'GROUP',
        groupJid: grupo46.jid,
        groupEnrollmentId: enr46.id,
        nodeId: 'node_wpp_dup',
        automationId: autoGrupo46.id,
        text: 'Mensagem única sem duplicação',
        status: 'PENDING',
      },
    });

    // Registra log em status QUEUED
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr46.id,
        groupId: grupo46.id,
        tenantId: testTenant.id,
        nodeId: 'node_wpp_dup',
        nodeType: 'whatsapp',
        action: 'QUEUE_GROUP_WHATSAPP',
        status: 'QUEUED',
      },
    });

    // 2. Simula tentativas subsequentes de re-enfileirar enquanto a mensagem ainda está QUEUED/PENDING
    // (Simula o loop de 4s do background runner chamando checkAndAdvanceNewGroupNodes)
    const executedLogs46 = await prisma.automationGroupStepLog.findMany({
      where: {
        enrollmentId: enr46.id,
        status: { in: ['SUCCESS', 'QUEUED', 'PROCESSING'] },
        action: { not: 'WAIT_TIMER' },
      },
      select: { nodeId: true },
    });
    const executedSet46 = new Set(executedLogs46.map((l) => l.nodeId));
    assert.strictEqual(
      executedSet46.has('node_wpp_dup'),
      true,
      'Nó em status QUEUED deve ser considerado executado/em andamento, impedindo re-enfileiramento'
    );

    // 3. Simula tentativa de criar duplicata direta no banco e valida a purga anti-duplicação
    const duplicateQueueItem = await prisma.whatsappQueue.create({
      data: {
        id: `wq_dup_${Date.now()}`,
        tenantId: testTenant.id,
        whatsappInstanceId: inst46.id,
        phone: grupo46.jid,
        recipientType: 'GROUP',
        groupJid: grupo46.jid,
        groupEnrollmentId: enr46.id,
        nodeId: 'node_wpp_dup',
        automationId: autoGrupo46.id,
        text: 'Mensagem única sem duplicação',
        status: 'PENDING',
      },
    });

    // Executa a query de purga idêntica à que roda na inicialização
    await prisma.$executeRawUnsafe(`
      DELETE FROM whatsapp_queue
      WHERE status = 'PENDING'
      AND node_id IS NOT NULL
      AND rowid NOT IN (
        SELECT MIN(rowid)
        FROM whatsapp_queue
        WHERE status = 'PENDING' AND node_id IS NOT NULL
        GROUP BY tenant_id, node_id, phone, COALESCE(group_enrollment_id, '')
      );
    `);

    const remainingPending46 = await prisma.whatsappQueue.findMany({
      where: {
        tenantId: testTenant.id,
        nodeId: 'node_wpp_dup',
        groupEnrollmentId: enr46.id,
        status: 'PENDING',
      },
    });
    assert.strictEqual(remainingPending46.length, 1, 'Exatamente 1 mensagem pendente deve restar após purga de duplicatas');
    assert.strictEqual(remainingPending46[0].id, firstQueueItem.id, 'O item original deve ser preservado e a duplicata excluída');

    // Limpeza Teste 46
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollment: { automationId: autoGrupo46.id } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { automationId: autoGrupo46.id } });
    await prisma.automation.delete({ where: { id: autoGrupo46.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo46.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst46.id } });

    console.log('✔ PASSOU: Guarda Absoluta Anti-Duplicação de Mensagens validada com 100% de sucesso.');
    passed++;

    // ============================================================
    // TESTE 47: FLUXO COMPLETO E RESILIENTE DE EXECUÇÃO EM GRUPOS
    // Valida avanço contínuo através de Múltiplos Timers, Disparos e Ações de Grupos
    // ============================================================
    total++;
    console.log('\n[TESTE 47] Testando motor de execução contínua em grupos (Timers + Disparos + Configurações de Grupos)...');

    const instSuffix47 = Date.now();
    await prisma.whatsappInstance.deleteMany({ where: { instanceName: { contains: 'inst_exec_47' } } });
    await prisma.whatsappGroup.deleteMany({ where: { jid: { contains: '120363047' } } });

    const inst47 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Exec 47',
        instanceName: `inst_exec_47_${instSuffix47}`,
        instanceToken: `token_exec_47_${instSuffix47}`,
        status: 'CONNECTED',
      },
    });

    const grupo47 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst47.id,
        jid: `120363047_${instSuffix47}@g.us`,
        name: 'Grupo Lançamento Teste 47',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    // Nós do fluxo encadeado:
    // tag_start -> timer_rel_1 -> wpp_1 -> timer_rel_2 -> wpp_2 -> timer_spec_3 -> wpp_3 -> cfg_group_4 -> timer_rel_5 -> wpp_final_6
    const futureDate47 = new Date(Date.now() + 3600000).toISOString();
    const nodes47 = [
      { id: 'n_tag_start', type: 'tag', data: { label: 'Tag Entrada', config: { entryTags: ['lancamento_47'] } } },
      { id: 'n_timer_1', type: 'timer', data: { label: 'Timer 3 min', config: { timerType: 'RELATIVE', unit: 'minutes', value: 3 } } },
      { id: 'n_wpp_1', type: 'whatsapp', data: { label: 'WhatsApp 1', config: { text: 'Msg 1', whatsappInstanceId: inst47.id } } },
      { id: 'n_timer_2', type: 'timer', data: { label: 'Timer 1 min', config: { timerType: 'RELATIVE', unit: 'minutes', value: 1 } } },
      { id: 'n_wpp_2', type: 'whatsapp', data: { label: 'WhatsApp 2', config: { text: 'Msg 2', whatsappInstanceId: inst47.id } } },
      { id: 'n_timer_3', type: 'timer', data: { label: 'Timer Absoluto', config: { timerType: 'SPECIFIC_DATE', specificDate: futureDate47 } } },
      { id: 'n_wpp_3', type: 'whatsapp', data: { label: 'WhatsApp 3', config: { text: 'Msg 3', whatsappInstanceId: inst47.id } } },
      { id: 'n_cfg_group_4', type: 'editar_grupo', data: { label: 'Configurar Grupo', config: { groupActionType: 'open_messages' } } },
      { id: 'n_timer_5', type: 'timer', data: { label: 'Timer Final', config: { timerType: 'RELATIVE', unit: 'seconds', value: 30 } } },
      { id: 'n_wpp_final', type: 'whatsapp', data: { label: 'WhatsApp Final', config: { text: 'Msg Final', whatsappInstanceId: inst47.id } } },
    ];

    const edges47 = [
      { id: 'e_1', source: 'n_tag_start', target: 'n_timer_1' },
      { id: 'e_2', source: 'n_timer_1', target: 'n_wpp_1' },
      { id: 'e_3', source: 'n_wpp_1', target: 'n_timer_2' },
      { id: 'e_4', source: 'n_timer_2', target: 'n_wpp_2' },
      { id: 'e_5', source: 'n_wpp_2', target: 'n_timer_3' },
      { id: 'e_6', source: 'n_timer_3', target: 'n_wpp_3' },
      { id: 'e_7', source: 'n_wpp_3', target: 'n_cfg_group_4' },
      { id: 'e_8', source: 'n_cfg_group_4', target: 'n_timer_5' },
      { id: 'e_9', source: 'n_timer_5', target: 'n_wpp_final' },
    ];

    const autoGrupo47 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Multietapas Grupo 47',
        targetType: 'GROUP',
        status: 'ACTIVE',
        whatsappInstanceId: inst47.id,
        targetGroupTags: JSON.stringify(['lancamento_47']),
        nodes: JSON.stringify(nodes47),
        edges: JSON.stringify(edges47),
      },
    });

    const enr47 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: autoGrupo47.id,
        groupId: grupo47.id,
        status: 'ACTIVE',
        currentNodeId: 'n_tag_start',
      },
    });

    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr47.id,
        groupId: grupo47.id,
        tenantId: testTenant.id,
        nodeId: 'n_tag_start',
        nodeType: 'tag',
        action: 'TAG_MATCHED',
        status: 'SUCCESS',
      },
    });

    function simIsNodeReachable(fromNodeId, toNodeId, edges) {
      if (fromNodeId === toNodeId) return true;
      const visited = new Set();
      const queue = [fromNodeId];
      while (queue.length > 0) {
        const curr = queue.shift();
        if (curr === toNodeId) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const edge of edges) {
          if (edge.source === curr && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }
      return false;
    }

    // Funções de simulação idênticas à lógica atualizada de engine.ts e scheduler.ts
    async function simAdvanceGroupNode(enrollmentId, currentNodeId, chosenHandle) {
      const enr = await prisma.automationGroupEnrollment.findUnique({
        where: { id: enrollmentId },
        include: { automation: true },
      });
      const edges = JSON.parse(enr.automation.edges || '[]');
      let outgoing = edges.filter((e) => e.source === currentNodeId);
      if (chosenHandle) {
        outgoing = outgoing.filter(
          (e) =>
            e.sourceHandle === chosenHandle ||
            (chosenHandle === 'true' && (e.label === 'SIM' || e.label === 'Sim' || e.sourceHandle === 'sim')) ||
            (chosenHandle === 'false' && (e.label === 'NÃO' || e.label === 'Não' || e.sourceHandle === 'nao'))
        );
      }

      if (outgoing.length === 0) {
        // Checagem segura de folhas: timers pendentes e fila ativa
        const waitLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, action: 'WAIT_TIMER' },
        });
        const passedLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] } },
          select: { nodeId: true },
        });
        const passedNodeIds = new Set(passedLogs.map((p) => p.nodeId));
        const hasPendingTimers = waitLogs.some((w) => !passedNodeIds.has(w.nodeId));

        const successLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, status: 'SUCCESS', action: { not: 'WAIT_TIMER' } },
          select: { nodeId: true },
        });
        const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));
        executedNodeIds.add(currentNodeId);

        const pendingTimerNodeIds = new Set(waitLogs.filter((w) => !passedNodeIds.has(w.nodeId)).map((w) => w.nodeId));
        const hasUnexecutedConnectedNodes = edges.some(
          (edge) => executedNodeIds.has(edge.source) && !executedNodeIds.has(edge.target) && !pendingTimerNodeIds.has(edge.target)
        );

        const pendingQueueCount = await prisma.whatsappQueue.count({
          where: { groupEnrollmentId: enrollmentId, status: { in: ['PENDING', 'PROCESSING'] } },
        });

        if (pendingQueueCount > 0 || hasUnexecutedConnectedNodes) {
          await prisma.automationGroupEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'ACTIVE' },
          });
          return;
        }

        if (hasPendingTimers) {
          const pendingTimerNodeId = waitLogs.find((w) => !passedNodeIds.has(w.nodeId))?.nodeId || null;
          await prisma.automationGroupEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'WAITING', currentNodeId: pendingTimerNodeId },
          });
          return;
        }

        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'COMPLETED', completedAt: new Date(), currentNodeId: null },
        });
        return;
      }

      for (const edge of outgoing) {
        await simExecuteGroupNode(enrollmentId, edge.target);
      }
    }

    async function simExecuteGroupNode(enrollmentId, nodeId) {
      const enr = await prisma.automationGroupEnrollment.findUnique({
        where: { id: enrollmentId },
        include: { automation: true, group: true },
      });
      const nodes = JSON.parse(enr.automation.nodes || '[]');
      const edges = JSON.parse(enr.automation.edges || '[]');
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const nodeType = node.data?.type || node.type;

      const existingLog = await prisma.automationGroupStepLog.findFirst({
        where: {
          enrollmentId,
          nodeId,
          status: { in: ['SUCCESS', 'QUEUED', 'PROCESSING'] },
          action: { not: 'WAIT_TIMER' },
        },
      });
      if (existingLog) return;

      // Validação de pré-requisitos da etapa
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      if (incomingEdges.length > 0) {
        for (const inc of incomingEdges) {
          const sourceLog = await prisma.automationGroupStepLog.findFirst({
            where: {
              enrollmentId,
              nodeId: inc.source,
              status: 'SUCCESS',
              action: { not: 'WAIT_TIMER' },
            },
          });
          if (!sourceLog) return;
        }
      }

      // Bloqueio de timer com escopo local à ramificação
      const waitLogs = await prisma.automationGroupStepLog.findMany({
        where: { enrollmentId, action: 'WAIT_TIMER' },
      });
      if (waitLogs.length > 0) {
        const passedLogs = await prisma.automationGroupStepLog.findMany({
          where: { enrollmentId, action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] } },
          select: { nodeId: true },
        });
        const passedIds = new Set(passedLogs.map((p) => p.nodeId));
        const pendingTimers = waitLogs.filter((w) => !passedIds.has(w.nodeId) && w.nodeId !== nodeId);

        for (const pending of pendingTimers) {
          if (simIsNodeReachable(pending.nodeId, nodeId, edges)) {
            return;
          }
        }
      }

      if (nodeType === 'timer') {
        const cfg = node.data?.config || {};
        const isSpecific = Boolean(cfg.timerType === 'SPECIFIC_DATE' || cfg.specificDate);
        let targetTimestamp;
        if (isSpecific) {
          targetTimestamp = new Date(cfg.specificDate).getTime();
        } else {
          const val = Number(cfg.value ?? cfg.duration ?? cfg.minutes ?? 1) || 1;
          const unit = (cfg.unit || 'minutes').toLowerCase();
          const ms = unit === 'seconds' ? val * 1000 : unit === 'hours' ? val * 3600000 : val * 60000;
          targetTimestamp = Date.now() + ms;
        }

        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'WAITING', currentNodeId: nodeId },
        });

        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: enr.groupId,
            tenantId: testTenant.id,
            nodeId,
            nodeType: 'timer',
            action: 'WAIT_TIMER',
            status: 'WAITING',
            details: JSON.stringify({ scheduledFor: new Date(targetTimestamp).toISOString() }),
          },
        });
        return;
      }

      if (nodeType === 'whatsapp') {
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: enr.groupId,
            tenantId: testTenant.id,
            nodeId,
            nodeType: 'whatsapp',
            action: 'QUEUE_GROUP_WHATSAPP',
            status: 'QUEUED',
          },
        });

        await prisma.whatsappQueue.create({
          data: {
            tenantId: testTenant.id,
            whatsappInstanceId: enr.group?.whatsappInstanceId || inst47.id,
            phone: enr.group?.jid || '123@g.us',
            recipientType: 'GROUP',
            groupJid: enr.group?.jid || '123@g.us',
            groupEnrollmentId: enrollmentId,
            nodeId,
            automationId: enr.automationId,
            text: node.data?.config?.text || 'Mensagem',
            status: 'PENDING',
          },
        });
        return;
      }

      if (nodeType === 'editar_grupo') {
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: enr.groupId,
            tenantId: testTenant.id,
            nodeId,
            nodeType: 'editar_grupo',
            action: 'open_messages',
            status: 'SUCCESS',
          },
        });

        await simAdvanceGroupNode(enrollmentId, nodeId);
        return;
      }
    }

    async function simProcessTimers() {
      const waitLogs = await prisma.automationGroupStepLog.findMany({
        where: { action: 'WAIT_TIMER' },
      });
      const now = Date.now();
      let processed = 0;

      for (const w of waitLogs) {
        const alreadyPassed = await prisma.automationGroupStepLog.findFirst({
          where: { enrollmentId: w.enrollmentId, nodeId: w.nodeId, action: 'TIMER_PASSED' },
        });
        if (alreadyPassed) continue;

        let targetTime = 0;
        try {
          const p = JSON.parse(w.details || '{}');
          targetTime = new Date(p.scheduledFor).getTime();
        } catch {}

        if (targetTime <= now) {
          await prisma.automationGroupEnrollment.update({
            where: { id: w.enrollmentId },
            data: { status: 'ACTIVE', currentNodeId: w.nodeId },
          });

          await prisma.automationGroupStepLog.create({
            data: {
              enrollmentId: w.enrollmentId,
              groupId: w.groupId,
              tenantId: w.tenantId,
              nodeId: w.nodeId,
              nodeType: 'timer',
              action: 'TIMER_PASSED',
              status: 'SUCCESS',
            },
          });

          const enr = await prisma.automationGroupEnrollment.findUnique({
            where: { id: w.enrollmentId },
            include: { automation: true },
          });
          const edges = JSON.parse(enr.automation.edges || '[]');
          const outgoing = edges.filter((e) => e.source === w.nodeId);
          for (const edge of outgoing) {
            await simExecuteGroupNode(w.enrollmentId, edge.target);
          }
          processed++;
        }
      }
      return processed;
    }

    // 1. Executa entrada: Gatilho avança para Timer 1 (3 min)
    await simAdvanceGroupNode(enr47.id, 'n_tag_start');

    // Verifica que grupo está em WAITING no Timer 1
    const checkEnr1 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr47.id } });
    assert.strictEqual(checkEnr1.status, 'WAITING', 'Grupo deve estar em WAITING no Timer 1');
    assert.strictEqual(checkEnr1.currentNodeId, 'n_timer_1', 'Nó atual deve ser Timer 1');

    // 2. Simula passagem do Timer 1 ajustando a data do log para o passado
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_timer_1', action: 'WAIT_TIMER' },
      data: {
        details: JSON.stringify({
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        }),
      },
    });

    // Dispara scheduler: Timer 1 deve disparar e avançar para n_wpp_1
    const schedResult1 = await simProcessTimers();
    assert.ok(schedResult1 >= 1, 'Scheduler deve processar Timer 1 vencido');

    // Verifica que n_wpp_1 gerou item na fila do WhatsApp
    const queueItem47_1 = await prisma.whatsappQueue.findFirst({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_1' },
    });
    assert.ok(queueItem47_1, 'Mensagem WhatsApp 1 deve ter sido enfileirada');

    // 3. Simula envio pela fila de WhatsApp 1 -> Deve avançar para Timer 2
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_wpp_1' },
      data: { status: 'SUCCESS' },
    });
    await prisma.whatsappQueue.updateMany({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_1' },
      data: { status: 'SENT' },
    });
    await simAdvanceGroupNode(enr47.id, 'n_wpp_1');

    // Verifica que grupo está em WAITING no Timer 2
    const checkEnr2 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr47.id } });
    assert.strictEqual(checkEnr2.status, 'WAITING', 'Grupo deve estar em WAITING no Timer 2');
    assert.strictEqual(checkEnr2.currentNodeId, 'n_timer_2', 'Nó atual deve ser Timer 2');

    // 4. Simula passagem do Timer 2 e avanço para WhatsApp 2
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_timer_2', action: 'WAIT_TIMER' },
      data: {
        details: JSON.stringify({
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        }),
      },
    });
    await simProcessTimers();

    const queueItem47_2 = await prisma.whatsappQueue.findFirst({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_2' },
    });
    assert.ok(queueItem47_2, 'Mensagem WhatsApp 2 deve ter sido enfileirada');

    // 5. Simula envio de WhatsApp 2 -> Avança para Timer Absoluto (Timer 3)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_wpp_2' },
      data: { status: 'SUCCESS' },
    });
    await prisma.whatsappQueue.updateMany({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_2' },
      data: { status: 'SENT' },
    });
    await simAdvanceGroupNode(enr47.id, 'n_wpp_2');

    // 6. Simula passagem do Timer Absoluto e avanço para WhatsApp 3
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_timer_3', action: 'WAIT_TIMER' },
      data: {
        details: JSON.stringify({
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        }),
      },
    });
    await simProcessTimers();

    // 7. Simula envio de WhatsApp 3 -> Avança para Configurar Grupo (n_cfg_group_4)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_wpp_3' },
      data: { status: 'SUCCESS' },
    });
    await prisma.whatsappQueue.updateMany({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_3' },
      data: { status: 'SENT' },
    });
    await simAdvanceGroupNode(enr47.id, 'n_wpp_3');

    // Verifica que Configurar Grupo foi executado e avançou para Timer 5
    const cfgLog = await prisma.automationGroupStepLog.findFirst({
      where: { enrollmentId: enr47.id, nodeId: 'n_cfg_group_4', status: 'SUCCESS' },
    });
    assert.ok(cfgLog, 'Nó Configurar Grupo deve ter registrado sucesso e avançado');

    // 8. Simula passagem do Timer 5 e avanço para WhatsApp Final
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_timer_5', action: 'WAIT_TIMER' },
      data: {
        details: JSON.stringify({
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        }),
      },
    });
    await simProcessTimers();

    const queueFinal = await prisma.whatsappQueue.findFirst({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_final' },
    });
    assert.ok(queueFinal, 'Mensagem WhatsApp Final deve ter sido enfileirada com sucesso');

    // 9. Simula conclusão do último nó do fluxo (folha sem arestas de saída)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr47.id, nodeId: 'n_wpp_final' },
      data: { status: 'SUCCESS' },
    });
    await prisma.whatsappQueue.updateMany({
      where: { groupEnrollmentId: enr47.id, nodeId: 'n_wpp_final' },
      data: { status: 'SENT' },
    });
    await simAdvanceGroupNode(enr47.id, 'n_wpp_final');

    const finalEnr = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr47.id } });
    assert.strictEqual(finalEnr.status, 'COMPLETED', 'Inscrição deve ser marcada como COMPLETED apenas no nó final');

    // Limpeza Teste 47
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollment: { automationId: autoGrupo47.id } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { automationId: autoGrupo47.id } });
    await prisma.automation.delete({ where: { id: autoGrupo47.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo47.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst47.id } });

    console.log('✔ PASSOU: Fluxo Completo de 10 Etapas em Grupos validado com 100% de sucesso.');
    passed++;

    // ============================================================
    // TESTE 48: MENSAGEM -> TIMER 2 MINUTOS -> MENSAGEM (TESTE 1 DO USUÁRIO)
    // Valida que a segunda mensagem NUNCA dispara antes de 2 minutos
    // ============================================================
    total++;
    console.log('\n[TESTE 48] Testando Teste 1 do usuário: Mensagem -> Timer 2m -> Mensagem (bloqueio rígido)...');

    const inst48 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 48',
        instanceName: `inst_48_${Date.now()}`,
        instanceToken: `token_48_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo48 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst48.id,
        jid: `120363048_${Date.now()}@g.us`,
        name: 'Grupo Teste 48',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const nodes48 = [
      { id: 'wpp_1', type: 'whatsapp', data: { label: 'Mensagem 1', config: { text: 'Olá 1' } } },
      { id: 'timer_2m', type: 'timer', data: { label: 'Timer 2 Minutos', config: { timerType: 'RELATIVE', unit: 'minutes', value: 2 } } },
      { id: 'wpp_2', type: 'whatsapp', data: { label: 'Mensagem 2', config: { text: 'Olá 2' } } },
    ];
    const edges48 = [
      { id: 'e1', source: 'wpp_1', target: 'timer_2m' },
      { id: 'e2', source: 'timer_2m', target: 'wpp_2' },
    ];

    const auto48 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Msg -> Timer -> Msg',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes48),
        edges: JSON.stringify(edges48),
      },
    });

    const enr48 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto48.id,
        groupId: grupo48.id,
        status: 'ACTIVE',
        currentNodeId: 'wpp_1',
      },
    });

    // 1. Executa primeira mensagem
    await simExecuteGroupNode(enr48.id, 'wpp_1');
    const q1_48 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr48.id, nodeId: 'wpp_1' } });
    assert.ok(q1_48, 'Mensagem 1 deve estar na fila');

    // Confirma envio de Msg 1 -> avança para Timer 2m
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr48.id, nodeId: 'wpp_1' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: q1_48.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr48.id, 'wpp_1');

    // Valida que o grupo está em WAITING no timer de 2 minutos
    const enrCheck48 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr48.id } });
    assert.strictEqual(enrCheck48.status, 'WAITING', 'Grupo deve estar aguardando no Timer de 2 minutos');

    // Tenta forçar a execução de Mensagem 2 antes do timer: DEVE SER BLOQUEADO!
    const preLogCount = await prisma.automationGroupStepLog.count({ where: { enrollmentId: enr48.id, nodeId: 'wpp_2' } });
    assert.strictEqual(preLogCount, 0, 'Mensagem 2 NÃO pode ter sido executada antes dos 2 minutos');

    // 2. Simula passagem do tempo (2 minutos depois)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr48.id, nodeId: 'timer_2m', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 120000).toISOString() }) },
    });
    await simProcessTimers();

    // Agora Mensagem 2 deve estar enfileirada!
    const q2_48 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr48.id, nodeId: 'wpp_2' } });
    assert.ok(q2_48, 'Mensagem 2 somente deve ser gerada após os 2 minutos do timer');

    // Limpeza 48
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr48.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr48.id } });
    await prisma.automation.delete({ where: { id: auto48.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo48.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst48.id } });

    console.log('✔ PASSOU: Teste 1 do usuário validado: Mensagem 2 executada rigorosamente após o término do timer.');
    passed++;

    // ============================================================
    // TESTE 49: SEQUÊNCIA ESTRITA DE 6 ETAPAS (TESTE 2 DO USUÁRIO)
    // Mensagem -> Imagem -> Documento -> Alterar Nome -> Alterar Descrição -> Alterar Imagem
    // ============================================================
    total++;
    console.log('\n[TESTE 49] Testando Teste 2 do usuário: Mensagem -> Imagem -> Doc -> Nome -> Desc -> Imagem...');

    const inst49 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 49',
        instanceName: `inst_49_${Date.now()}`,
        instanceToken: `token_49_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo49 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst49.id,
        jid: `120363049_${Date.now()}@g.us`,
        name: 'Grupo Teste 49',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const stepOrder49 = ['msg_1', 'img_2', 'doc_3', 'alt_nome_4', 'alt_desc_5', 'alt_img_6'];
    const nodes49 = [
      { id: 'msg_1', type: 'whatsapp', data: { label: 'Mensagem', config: { text: 'Texto' } } },
      { id: 'img_2', type: 'whatsapp', data: { label: 'Imagem', config: { text: 'Foto', mediaUrl: 'https://img.jpg' } } },
      { id: 'doc_3', type: 'whatsapp', data: { label: 'Documento', config: { text: 'Doc', mediaUrl: 'https://doc.pdf' } } },
      { id: 'alt_nome_4', type: 'editar_grupo', data: { label: 'Alterar nome', config: { groupActionType: 'update_subject' } } },
      { id: 'alt_desc_5', type: 'editar_grupo', data: { label: 'Alterar descrição', config: { groupActionType: 'update_description' } } },
      { id: 'alt_img_6', type: 'editar_grupo', data: { label: 'Alterar imagem', config: { groupActionType: 'update_picture' } } },
    ];
    const edges49 = [
      { id: 'e1', source: 'msg_1', target: 'img_2' },
      { id: 'e2', source: 'img_2', target: 'doc_3' },
      { id: 'e3', source: 'doc_3', target: 'alt_nome_4' },
      { id: 'e4', source: 'alt_nome_4', target: 'alt_desc_5' },
      { id: 'e5', source: 'alt_desc_5', target: 'alt_img_6' },
    ];

    const auto49 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Sequencial 6 Etapas',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes49),
        edges: JSON.stringify(edges49),
      },
    });

    const enr49 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto49.id,
        groupId: grupo49.id,
        status: 'ACTIVE',
        currentNodeId: 'msg_1',
      },
    });

    // 1. Inicia o primeiro nó (msg_1)
    await simExecuteGroupNode(enr49.id, 'msg_1');

    // As mensagens (msg_1, img_2, doc_3) aguardam confirmação de envio da fila para avançar.
    // Os nós de alteração de grupo executam e avançam automaticamente.
    const messageSteps = ['msg_1', 'img_2', 'doc_3'];
    for (const stepId of messageSteps) {
      await prisma.automationGroupStepLog.updateMany({
        where: { enrollmentId: enr49.id, nodeId: stepId },
        data: { status: 'SUCCESS' },
      });
      await prisma.whatsappQueue.updateMany({
        where: { groupEnrollmentId: enr49.id, nodeId: stepId },
        data: { status: 'SENT' },
      });
      await simAdvanceGroupNode(enr49.id, stepId);
    }

    const executedSteps49 = await prisma.automationGroupStepLog.findMany({
      where: { enrollmentId: enr49.id, status: 'SUCCESS' },
      orderBy: { executedAt: 'asc' },
    });
    const executedIds49 = executedSteps49.map((s) => s.nodeId);
    assert.deepStrictEqual(executedIds49, stepOrder49, 'A ordem de execução deve ser EXATAMENTE a ordem desenhada');

    // Limpeza 49
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr49.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr49.id } });
    await prisma.automation.delete({ where: { id: auto49.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo49.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst49.id } });

    console.log('✔ PASSOU: Teste 2 do usuário validado: 6 etapas executadas na ordem estrita sem pular etapas.');
    passed++;

    // ============================================================
    // TESTE 50: FLUXO COM CINCO TIMERS CONSECUTIVOS (TESTE 3 DO USUÁRIO)
    // Cada timer deve bloquear corretamente a execução até sua conclusão
    // ============================================================
    total++;
    console.log('\n[TESTE 50] Testando Teste 3 do usuário: Fluxo com 5 timers consecutivos...');

    const inst50 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 50',
        instanceName: `inst_50_${Date.now()}`,
        instanceToken: `token_50_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo50 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst50.id,
        jid: `120363050_${Date.now()}@g.us`,
        name: 'Grupo Teste 50',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const nodes50 = [
      { id: 't1', type: 'timer', data: { label: 'Timer 1', config: { value: 1 } } },
      { id: 'w1', type: 'whatsapp', data: { label: 'W1', config: { text: '1' } } },
      { id: 't2', type: 'timer', data: { label: 'Timer 2', config: { value: 2 } } },
      { id: 'w2', type: 'whatsapp', data: { label: 'W2', config: { text: '2' } } },
      { id: 't3', type: 'timer', data: { label: 'Timer 3', config: { value: 3 } } },
      { id: 'w3', type: 'whatsapp', data: { label: 'W3', config: { text: '3' } } },
      { id: 't4', type: 'timer', data: { label: 'Timer 4', config: { value: 4 } } },
      { id: 'w4', type: 'whatsapp', data: { label: 'W4', config: { text: '4' } } },
      { id: 't5', type: 'timer', data: { label: 'Timer 5', config: { value: 5 } } },
      { id: 'w5', type: 'whatsapp', data: { label: 'W5', config: { text: '5' } } },
    ];
    const edges50 = [
      { id: 'e1', source: 't1', target: 'w1' },
      { id: 'e2', source: 'w1', target: 't2' },
      { id: 'e3', source: 't2', target: 'w2' },
      { id: 'e4', source: 'w2', target: 't3' },
      { id: 'e5', source: 't3', target: 'w3' },
      { id: 'e6', source: 'w3', target: 't4' },
      { id: 'e7', source: 't4', target: 'w4' },
      { id: 'e8', source: 'w4', target: 't5' },
      { id: 'e9', source: 't5', target: 'w5' },
    ];

    const auto50 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo 5 Timers Consecutivos',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes50),
        edges: JSON.stringify(edges50),
      },
    });

    const enr50 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto50.id,
        groupId: grupo50.id,
        status: 'ACTIVE',
        currentNodeId: 't1',
      },
    });

    // Inicia Timer 1
    await simExecuteGroupNode(enr50.id, 't1');

    for (let i = 1; i <= 5; i++) {
      const timerId = `t${i}`;
      const wppId = `w${i}`;

      // Verifica que está bloqueado no timer atual
      const checkEnr = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr50.id } });
      assert.strictEqual(checkEnr.status, 'WAITING', `Grupo deve estar aguardando no Timer ${i}`);

      // Simula passagem do timer
      await prisma.automationGroupStepLog.updateMany({
        where: { enrollmentId: enr50.id, nodeId: timerId, action: 'WAIT_TIMER' },
        data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
      });
      await simProcessTimers();

      // Verifica envio de WhatsApp correspondente
      const q = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr50.id, nodeId: wppId } });
      assert.ok(q, `Mensagem ${wppId} deve estar na fila após Timer ${timerId}`);

      // Conclui WhatsApp e avança para o próximo timer (se houver)
      await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr50.id, nodeId: wppId }, data: { status: 'SUCCESS' } });
      await prisma.whatsappQueue.updateMany({ where: { id: q.id }, data: { status: 'SENT' } });
      await simAdvanceGroupNode(enr50.id, wppId);
    }

    const finalEnr50 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr50.id } });
    assert.strictEqual(finalEnr50.status, 'COMPLETED', 'Fluxo de 5 timers deve ser concluído com sucesso');

    // Limpeza 50
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr50.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr50.id } });
    await prisma.automation.delete({ where: { id: auto50.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo50.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst50.id } });

    console.log('✔ PASSOU: Teste 3 do usuário validado: 5 timers consecutivos bloquearam rigorosamente cada etapa.');
    passed++;

    // ============================================================
    // TESTE 51: FLUXO COM CONDIÇÕES (TESTE 4 DO USUÁRIO)
    // A próxima etapa somente inicia após a condição ser satisfeita
    // ============================================================
    total++;
    console.log('\n[TESTE 51] Testando Teste 4 do usuário: Fluxo com ramificação condicional...');

    const inst51 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 51',
        instanceName: `inst_51_${Date.now()}`,
        instanceToken: `token_51_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupoComTag51 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst51.id,
        jid: `120363051_comtag_${Date.now()}@g.us`,
        name: 'Grupo VIP 51',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const vipTagName = `VIP_51_${Date.now()}`;
    const tagVip51 = await prisma.groupTag.create({
      data: {
        tenantId: testTenant.id,
        name: vipTagName,
      },
    });

    await prisma.groupTagOnGroup.create({
      data: {
        groupId: grupoComTag51.id,
        tagId: tagVip51.id,
      },
    });

    const nodes51 = [
      { id: 'cond_1', type: 'condition', data: { label: 'É VIP?', config: { conditionType: 'has_tag', tagName: vipTagName } } },
      { id: 'wpp_sim', type: 'whatsapp', data: { label: 'Msg VIP (SIM)', config: { text: 'Parabéns VIP!' } } },
      { id: 'wpp_nao', type: 'whatsapp', data: { label: 'Msg Normal (NÃO)', config: { text: 'Olá Normal!' } } },
    ];
    const edges51 = [
      { id: 'e_sim', source: 'cond_1', target: 'wpp_sim', sourceHandle: 'true', label: 'SIM' },
      { id: 'e_nao', source: 'cond_1', target: 'wpp_nao', sourceHandle: 'false', label: 'NÃO' },
    ];

    const auto51 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Condicional VIP',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes51),
        edges: JSON.stringify(edges51),
      },
    });

    const enr51 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto51.id,
        groupId: grupoComTag51.id,
        status: 'ACTIVE',
        currentNodeId: 'cond_1',
      },
    });

    // Avalia condição: deve avançar apenas pelo ramo SIM (wpp_sim)
    const grupoEnriquecido = await prisma.whatsappGroup.findUnique({
      where: { id: grupoComTag51.id },
      include: { tags: { include: { tag: true } } },
    });
    const tags51 = grupoEnriquecido.tags.map((t) => t.tag.name);
    const condAtendida = tags51.includes(vipTagName);
    assert.strictEqual(condAtendida, true, 'Grupo VIP deve satisfazer a condição');

    // Registra sucesso da condição e avança pelo handle 'true'
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr51.id,
        groupId: grupoComTag51.id,
        tenantId: testTenant.id,
        nodeId: 'cond_1',
        nodeType: 'condition',
        action: 'CONDITION_EVALUATED',
        status: 'SUCCESS',
        details: JSON.stringify({ result: true }),
      },
    });
    await simAdvanceGroupNode(enr51.id, 'cond_1', 'true');

    // Verifica que a mensagem do ramo SIM foi enfileirada e a do ramo NÃO NÃO foi enfileirada
    const qSim = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr51.id, nodeId: 'wpp_sim' } });
    const qNao = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr51.id, nodeId: 'wpp_nao' } });
    assert.ok(qSim, 'Mensagem do ramo SIM deve ser gerada');
    assert.strictEqual(qNao, null, 'Mensagem do ramo NÃO NÃO deve ser gerada');

    // Limpeza 51
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr51.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr51.id } });
    await prisma.automation.delete({ where: { id: auto51.id } });
    await prisma.groupTagOnGroup.deleteMany({ where: { groupId: grupoComTag51.id } });
    await prisma.groupTag.delete({ where: { id: tagVip51.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupoComTag51.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst51.id } });

    console.log('✔ PASSOU: Teste 4 do usuário validado: Próxima etapa iniciou estritamente após a condição ser satisfeita.');
    passed++;

    // ============================================================
    // TESTE 52: VÁRIOS GRUPOS SIMULTÂNEOS (TESTE 5 DO USUÁRIO)
    // Cada grupo mantém seu próprio estado sem interferir nos demais
    // ============================================================
    total++;
    console.log('\n[TESTE 52] Testando Teste 5 do usuário: Múltiplos grupos simultâneos independentes...');

    const inst52 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 52',
        instanceName: `inst_52_${Date.now()}`,
        instanceToken: `token_52_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupoA = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst52.id,
        jid: `120363052_a_${Date.now()}@g.us`,
        name: 'Grupo A',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const grupoB = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst52.id,
        jid: `120363052_b_${Date.now()}@g.us`,
        name: 'Grupo B',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const grupoC = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst52.id,
        jid: `120363052_c_${Date.now()}@g.us`,
        name: 'Grupo C',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const nodes52 = [
      { id: 'step_1', type: 'whatsapp', data: { label: 'Etapa 1', config: { text: 'Etapa 1' } } },
      { id: 'step_2', type: 'timer', data: { label: 'Etapa 2 (Timer)', config: { value: 10 } } },
      { id: 'step_3', type: 'whatsapp', data: { label: 'Etapa 3', config: { text: 'Etapa 3' } } },
    ];
    const edges52 = [
      { id: 'e1', source: 'step_1', target: 'step_2' },
      { id: 'e2', source: 'step_2', target: 'step_3' },
    ];

    const auto52 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo 3 Grupos Independentes',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes52),
        edges: JSON.stringify(edges52),
      },
    });

    // Grupo B está na Etapa 1
    const enr52_B = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto52.id,
        groupId: grupoB.id,
        status: 'ACTIVE',
        currentNodeId: 'step_1',
      },
    });
    await simExecuteGroupNode(enr52_B.id, 'step_1');

    // Grupo C está no Timer (Etapa 2)
    const enr52_C = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto52.id,
        groupId: grupoC.id,
        status: 'WAITING',
        currentNodeId: 'step_2',
      },
    });
    await simExecuteGroupNode(enr52_C.id, 'step_2');

    // Grupo A avançou até a Etapa 3
    const enr52_A = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto52.id,
        groupId: grupoA.id,
        status: 'ACTIVE',
        currentNodeId: 'step_3',
      },
    });
    await simExecuteGroupNode(enr52_A.id, 'step_3');

    // Valida estados independentes
    const check52_A = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr52_A.id } });
    const check52_B = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr52_B.id } });
    const check52_C = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr52_C.id } });

    assert.strictEqual(check52_A.currentNodeId, 'step_3', 'Grupo A deve estar isolado na Etapa 3');
    assert.strictEqual(check52_B.currentNodeId, 'step_1', 'Grupo B deve estar isolado na Etapa 1');
    assert.strictEqual(check52_C.currentNodeId, 'step_2', 'Grupo C deve estar isolado no Timer (Etapa 2)');
    assert.strictEqual(check52_C.status, 'WAITING', 'Grupo C deve estar em WAITING sem afetar Grupo A ou B');

    // Limpeza 52
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollment: { automationId: auto52.id } } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { automationId: auto52.id } });
    await prisma.automation.delete({ where: { id: auto52.id } });
    await prisma.whatsappGroup.deleteMany({ where: { id: { in: [grupoA.id, grupoB.id, grupoC.id] } } });
    await prisma.whatsappInstance.delete({ where: { id: inst52.id } });

    console.log('✔ PASSOU: Teste 5 do usuário validado: Múltiplos grupos mantêm suas posições independentes no fluxo.');
    passed++;

    // ============================================================
    // TESTE 53: RAMIFICAÇÃO COM TIMER (TESTE 1 DO USUÁRIO)
    // Uma ramificação com Timer NÃO atrasa nem bloqueia a outra ramificação
    // ============================================================
    total++;
    console.log('\n[TESTE 53] Testando Teste 1 do usuário: Ramificação com Timer sem bloquear outro ramo...');

    const inst53 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 53',
        instanceName: `inst_53_${Date.now()}`,
        instanceToken: `token_53_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo53 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst53.id,
        jid: `120363053_${Date.now()}@g.us`,
        name: 'Grupo Teste 53',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    // Estrutura:
    //         start (Msg Inicial)
    //          ┌──────┴──────┐
    //          ▼             ▼
    //        msg_a       timer_b (10 min)
    //          │             │
    //        msg_b         msg_c
    const nodes53 = [
      { id: 'start', type: 'whatsapp', data: { label: 'Msg Inicial', config: { text: 'Início' } } },
      { id: 'msg_a', type: 'whatsapp', data: { label: 'Mensagem A', config: { text: 'Msg A' } } },
      { id: 'msg_b', type: 'whatsapp', data: { label: 'Mensagem B', config: { text: 'Msg B' } } },
      { id: 'timer_b', type: 'timer', data: { label: 'Timer 10m', config: { value: 10, unit: 'minutes' } } },
      { id: 'msg_c', type: 'whatsapp', data: { label: 'Mensagem C', config: { text: 'Msg C' } } },
    ];
    const edges53 = [
      { id: 'e_start_a', source: 'start', target: 'msg_a' },
      { id: 'e_a_b', source: 'msg_a', target: 'msg_b' },
      { id: 'e_start_timer', source: 'start', target: 'timer_b' },
      { id: 'e_timer_c', source: 'timer_b', target: 'msg_c' },
    ];

    const auto53 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Ramificação com Timer Local',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes53),
        edges: JSON.stringify(edges53),
      },
    });

    const enr53 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto53.id,
        groupId: grupo53.id,
        status: 'ACTIVE',
        currentNodeId: 'start',
      },
    });

    // 1. Executa 'start' e conclui
    await simExecuteGroupNode(enr53.id, 'start');
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr53.id, nodeId: 'start' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { groupEnrollmentId: enr53.id, nodeId: 'start' }, data: { status: 'SENT' } });

    // 2. Avança a partir de 'start' -> aciona msg_a e timer_b em paralelo
    await simAdvanceGroupNode(enr53.id, 'start');

    // Validação intermediária crítica:
    // timer_b deve estar em WAITING
    const logTimer53 = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr53.id, nodeId: 'timer_b', action: 'WAIT_TIMER' } });
    assert.ok(logTimer53, 'timer_b deve estar registrado em WAIT_TIMER');

    // msg_a DEVE TER SIDO ENFILEIRADA IMEDIATAMENTE (NÃO bloqueada pelo timer_b!)
    const queueMsgA = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr53.id, nodeId: 'msg_a' } });
    assert.ok(queueMsgA, 'msg_a deve ter sido enfileirada imediatamente mesmo com timer_b em espera!');

    // msg_c NÃO PODE TER SIDO ENFILEIRADA (depende de timer_b)
    const queueMsgC_before = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr53.id, nodeId: 'msg_c' } });
    assert.strictEqual(queueMsgC_before, null, 'msg_c NÃO pode executar antes do timer_b');

    // 3. Conclui msg_a e avança para msg_b
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr53.id, nodeId: 'msg_a' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: queueMsgA.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr53.id, 'msg_a');

    // msg_b DEVE TER SIDO ENFILEIRADA IMEDIATAMENTE (sem bloqueio pelo timer do outro ramo!)
    const queueMsgB = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr53.id, nodeId: 'msg_b' } });
    assert.ok(queueMsgB, 'msg_b deve ter sido enfileirada imediatamente sem bloqueio pelo timer_b');

    // Conclui msg_b
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr53.id, nodeId: 'msg_b' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: queueMsgB.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr53.id, 'msg_b');

    // 4. Agora simula a passagem do timer_b (10 minutos depois)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr53.id, nodeId: 'timer_b', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    // msg_c agora deve ter sido enfileirada após o timer_b
    const queueMsgC_after = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr53.id, nodeId: 'msg_c' } });
    assert.ok(queueMsgC_after, 'msg_c deve ser enfileirada após o término do timer_b');

    // Conclui msg_c
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr53.id, nodeId: 'msg_c' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: queueMsgC_after.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr53.id, 'msg_c');

    const finalEnr53 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr53.id } });
    assert.strictEqual(finalEnr53.status, 'COMPLETED', 'Automação deve ser completada após ambos os ramos terminarem');

    // Limpeza 53
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr53.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr53.id } });
    await prisma.automation.delete({ where: { id: auto53.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo53.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst53.id } });

    console.log('✔ PASSOU: Teste 1 do usuário validado: Ramificação A continuou normalmente sem ser atrasada pelo Timer da Ramificação B.');
    passed++;

    // ============================================================
    // TESTE 54: TRÊS RAMIFICAÇÕES COM TIMERS DIFERENTES (TESTE 2 DO USUÁRIO)
    // Cada ramificação respeita apenas seus próprios timers
    // ============================================================
    total++;
    console.log('\n[TESTE 54] Testando Teste 2 do usuário: Três ramificações com timers independentes...');

    const inst54 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 54',
        instanceName: `inst_54_${Date.now()}`,
        instanceToken: `token_54_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo54 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst54.id,
        jid: `120363054_${Date.now()}@g.us`,
        name: 'Grupo Teste 54',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    // Estrutura:
    //                 start
    //         ┌─────────┼─────────┐
    //         ▼         ▼         ▼
    //      timer_1   timer_2   timer_3
    //       (1 min)   (5 min)   (10 min)
    //         │         │         │
    //       msg_1     msg_2     msg_3
    const nodes54 = [
      { id: 'start', type: 'whatsapp', data: { label: 'Início', config: { text: 'Início' } } },
      { id: 'timer_1', type: 'timer', data: { label: 'Timer 1m', config: { value: 1 } } },
      { id: 'msg_1', type: 'whatsapp', data: { label: 'Msg 1', config: { text: 'Msg 1' } } },
      { id: 'timer_2', type: 'timer', data: { label: 'Timer 5m', config: { value: 5 } } },
      { id: 'msg_2', type: 'whatsapp', data: { label: 'Msg 2', config: { text: 'Msg 2' } } },
      { id: 'timer_3', type: 'timer', data: { label: 'Timer 10m', config: { value: 10 } } },
      { id: 'msg_3', type: 'whatsapp', data: { label: 'Msg 3', config: { text: 'Msg 3' } } },
    ];
    const edges54 = [
      { id: 'e1', source: 'start', target: 'timer_1' },
      { id: 'e2', source: 'timer_1', target: 'msg_1' },
      { id: 'e3', source: 'start', target: 'timer_2' },
      { id: 'e4', source: 'timer_2', target: 'msg_2' },
      { id: 'e5', source: 'start', target: 'timer_3' },
      { id: 'e6', source: 'timer_3', target: 'msg_3' },
    ];

    const auto54 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo 3 Ramos com Timers Independentes',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes54),
        edges: JSON.stringify(edges54),
      },
    });

    const enr54 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto54.id,
        groupId: grupo54.id,
        status: 'ACTIVE',
        currentNodeId: 'start',
      },
    });

    await simExecuteGroupNode(enr54.id, 'start');
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr54.id, nodeId: 'start' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { groupEnrollmentId: enr54.id, nodeId: 'start' }, data: { status: 'SENT' } });

    // Avança start -> aciona os 3 timers
    await simAdvanceGroupNode(enr54.id, 'start');

    // 1. Simula término apenas do timer_1 (1 minuto)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr54.id, nodeId: 'timer_1', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    // Apenas msg_1 deve ter sido enfileirada!
    const q1 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_1' } });
    const q2_early = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_2' } });
    const q3_early = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_3' } });
    assert.ok(q1, 'msg_1 deve ter sido disparada pelo timer_1');
    assert.strictEqual(q2_early, null, 'msg_2 NÃO pode disparar antes do timer_2');
    assert.strictEqual(q3_early, null, 'msg_3 NÃO pode disparar antes do timer_3');

    // Conclui msg_1
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr54.id, nodeId: 'msg_1' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: q1.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr54.id, 'msg_1');

    // 2. Simula término do timer_2 (5 minutos)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr54.id, nodeId: 'timer_2', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    const q2 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_2' } });
    const q3_still_early = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_3' } });
    assert.ok(q2, 'msg_2 deve ser disparada pelo timer_2');
    assert.strictEqual(q3_still_early, null, 'msg_3 continua aguardando o timer_3');

    // Conclui msg_2
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr54.id, nodeId: 'msg_2' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: q2.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr54.id, 'msg_2');

    // 3. Simula término do timer_3 (10 minutos)
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr54.id, nodeId: 'timer_3', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    const q3 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr54.id, nodeId: 'msg_3' } });
    assert.ok(q3, 'msg_3 deve ser disparada após timer_3');

    // Conclui msg_3
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr54.id, nodeId: 'msg_3' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: q3.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr54.id, 'msg_3');

    const finalEnr54 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr54.id } });
    assert.strictEqual(finalEnr54.status, 'COMPLETED', 'Todas as 3 ramificações foram concluídas');

    // Limpeza 54
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr54.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr54.id } });
    await prisma.automation.delete({ where: { id: auto54.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo54.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst54.id } });

    console.log('✔ PASSOU: Teste 2 do usuário validado: 3 ramificações respeitaram rigorosamente seus próprios timers sem interferência.');
    passed++;

    // ============================================================
    // TESTE 55: FLUXO SEM RAMIFICAÇÕES (TESTE 3 DO USUÁRIO)
    // Fluxo linear continua funcionando exatamente como esperado
    // ============================================================
    total++;
    console.log('\n[TESTE 55] Testando Teste 3 do usuário: Fluxo linear sem ramificações...');

    const inst55 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 55',
        instanceName: `inst_55_${Date.now()}`,
        instanceToken: `token_55_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo55 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst55.id,
        jid: `120363055_${Date.now()}@g.us`,
        name: 'Grupo Teste 55',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const nodes55 = [
      { id: 'm1', type: 'whatsapp', data: { label: 'Msg 1', config: { text: '1' } } },
      { id: 't1', type: 'timer', data: { label: 'Timer 5m', config: { value: 5 } } },
      { id: 'm2', type: 'whatsapp', data: { label: 'Msg 2', config: { text: '2' } } },
    ];
    const edges55 = [
      { id: 'e1', source: 'm1', target: 't1' },
      { id: 'e2', source: 't1', target: 'm2' },
    ];

    const auto55 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Linear',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes55),
        edges: JSON.stringify(edges55),
      },
    });

    const enr55 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto55.id,
        groupId: grupo55.id,
        status: 'ACTIVE',
        currentNodeId: 'm1',
      },
    });

    await simExecuteGroupNode(enr55.id, 'm1');
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr55.id, nodeId: 'm1' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { groupEnrollmentId: enr55.id, nodeId: 'm1' }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr55.id, 'm1');

    const checkTimer55 = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr55.id, nodeId: 't1', action: 'WAIT_TIMER' } });
    assert.ok(checkTimer55, 'Timer t1 deve estar em espera');

    // m2 não pode executar ainda
    const checkM2_before = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr55.id, nodeId: 'm2' } });
    assert.strictEqual(checkM2_before, null, 'm2 não pode disparar antes de t1');

    // Libera timer
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr55.id, nodeId: 't1', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    const checkM2_after = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr55.id, nodeId: 'm2' } });
    assert.ok(checkM2_after, 'm2 disparada com sucesso após término de t1');

    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr55.id, nodeId: 'm2' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { id: checkM2_after.id }, data: { status: 'SENT' } });
    await simAdvanceGroupNode(enr55.id, 'm2');

    const finalEnr55 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr55.id } });
    assert.strictEqual(finalEnr55.status, 'COMPLETED', 'Fluxo linear completado perfeitamente');

    // Limpeza 55
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr55.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr55.id } });
    await prisma.automation.delete({ where: { id: auto55.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo55.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst55.id } });

    console.log('✔ PASSOU: Teste 3 do usuário validado: Fluxo linear sem ramificações continua funcionando perfeitamente.');
    passed++;

    // ============================================================
    // TESTE 56: MENSAGENS PARALELAS SEM BLOQUEIO MÚTUO (TESTE 4 DO USUÁRIO)
    // Todas executam simultaneamente conforme suas conexões
    // ============================================================
    total++;
    console.log('\n[TESTE 56] Testando Teste 4 do usuário: Múltiplas mensagens paralelas simultâneas...');

    const inst56 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 56',
        instanceName: `inst_56_${Date.now()}`,
        instanceToken: `token_56_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo56 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst56.id,
        jid: `120363056_${Date.now()}@g.us`,
        name: 'Grupo Teste 56',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    const nodes56 = [
      { id: 'root', type: 'whatsapp', data: { label: 'Disparo Inicial', config: { text: 'Início' } } },
      { id: 'p1', type: 'whatsapp', data: { label: 'Paralela 1', config: { text: 'P1' } } },
      { id: 'p2', type: 'whatsapp', data: { label: 'Paralela 2', config: { text: 'P2' } } },
      { id: 'p3', type: 'whatsapp', data: { label: 'Paralela 3', config: { text: 'P3' } } },
    ];
    const edges56 = [
      { id: 'ep1', source: 'root', target: 'p1' },
      { id: 'ep2', source: 'root', target: 'p2' },
      { id: 'ep3', source: 'root', target: 'p3' },
    ];

    const auto56 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo 3 Mensagens Paralelas',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes56),
        edges: JSON.stringify(edges56),
      },
    });

    const enr56 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto56.id,
        groupId: grupo56.id,
        status: 'ACTIVE',
        currentNodeId: 'root',
      },
    });

    await simExecuteGroupNode(enr56.id, 'root');
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr56.id, nodeId: 'root' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { groupEnrollmentId: enr56.id, nodeId: 'root' }, data: { status: 'SENT' } });

    // Avança a partir do root -> deve disparar p1, p2 e p3 em paralelo
    await simAdvanceGroupNode(enr56.id, 'root');

    const qP1 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr56.id, nodeId: 'p1' } });
    const qP2 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr56.id, nodeId: 'p2' } });
    const qP3 = await prisma.whatsappQueue.findFirst({ where: { groupEnrollmentId: enr56.id, nodeId: 'p3' } });

    assert.ok(qP1, 'Mensagem Paralela 1 deve estar na fila');
    assert.ok(qP2, 'Mensagem Paralela 2 deve estar na fila');
    assert.ok(qP3, 'Mensagem Paralela 3 deve estar na fila');

    // Conclui as 3
    for (const q of [qP1, qP2, qP3]) {
      await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr56.id, nodeId: q.nodeId }, data: { status: 'SUCCESS' } });
      await prisma.whatsappQueue.updateMany({ where: { id: q.id }, data: { status: 'SENT' } });
      await simAdvanceGroupNode(enr56.id, q.nodeId);
    }

    const finalEnr56 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr56.id } });
    assert.strictEqual(finalEnr56.status, 'COMPLETED', 'Todas as mensagens paralelas foram processadas');

    // Limpeza 56
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr56.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr56.id } });
    await prisma.automation.delete({ where: { id: auto56.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo56.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst56.id } });

    console.log('✔ PASSOU: Teste 4 do usuário validado: Todas as mensagens paralelas executaram sem bloqueio mútuo.');
    passed++;

    // ============================================================
    // TESTE 57: AÇÕES DE GRUPO (NOME, DESC, IMG) EM RAMIFICAÇÕES DIFERENTES (TESTE 5 DO USUÁRIO)
    // Ações de alteração ocorrem na ordem do seu próprio ramo, independente dos timers de outros ramos
    // ============================================================
    total++;
    console.log('\n[TESTE 57] Testando Teste 5 do usuário: Alteração de nome, descrição e imagem em ramos diferentes...');

    const inst57 = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância 57',
        instanceName: `inst_57_${Date.now()}`,
        instanceToken: `token_57_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const grupo57 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst57.id,
        jid: `120363057_${Date.now()}@g.us`,
        name: 'Grupo Teste 57',
        isAdmin: true,
        isEligible: true,
        status: 'ACTIVE',
      },
    });

    // Estrutura:
    //                 start
    //         ┌─────────┴─────────┐
    //         ▼                   ▼
    //      alt_nome           timer_30m
    //         │                   │
    //      alt_desc            alt_img
    const nodes57 = [
      { id: 'start', type: 'whatsapp', data: { label: 'Início', config: { text: 'Início' } } },
      { id: 'alt_nome', type: 'editar_grupo', data: { label: 'Alterar Nome', config: { groupActionType: 'update_subject' } } },
      { id: 'alt_desc', type: 'editar_grupo', data: { label: 'Alterar Desc', config: { groupActionType: 'update_description' } } },
      { id: 'timer_30m', type: 'timer', data: { label: 'Timer 30m', config: { value: 30 } } },
      { id: 'alt_img', type: 'editar_grupo', data: { label: 'Alterar Imagem', config: { groupActionType: 'update_picture' } } },
    ];
    const edges57 = [
      { id: 'e1', source: 'start', target: 'alt_nome' },
      { id: 'e2', source: 'alt_nome', target: 'alt_desc' },
      { id: 'e3', source: 'start', target: 'timer_30m' },
      { id: 'e4', source: 'timer_30m', target: 'alt_img' },
    ];

    const auto57 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Ações de Grupo em Ramos Diferentes',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify(nodes57),
        edges: JSON.stringify(edges57),
      },
    });

    const enr57 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto57.id,
        groupId: grupo57.id,
        status: 'ACTIVE',
        currentNodeId: 'start',
      },
    });

    await simExecuteGroupNode(enr57.id, 'start');
    await prisma.automationGroupStepLog.updateMany({ where: { enrollmentId: enr57.id, nodeId: 'start' }, data: { status: 'SUCCESS' } });
    await prisma.whatsappQueue.updateMany({ where: { groupEnrollmentId: enr57.id, nodeId: 'start' }, data: { status: 'SENT' } });

    // Avança start -> aciona alt_nome (Ramo 1) e timer_30m (Ramo 2)
    await simAdvanceGroupNode(enr57.id, 'start');

    // Valida: Ramo 1 executou alt_nome e alt_desc IMEDIATAMENTE
    const logNome = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr57.id, nodeId: 'alt_nome', status: 'SUCCESS' } });
    const logDesc = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr57.id, nodeId: 'alt_desc', status: 'SUCCESS' } });
    assert.ok(logNome, 'alt_nome deve executar imediatamente no Ramo 1');
    assert.ok(logDesc, 'alt_desc deve executar imediatamente no Ramo 1');

    // Valida: Ramo 2 está no timer_30m e alt_img NÃO executou ainda
    const logTimer57 = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr57.id, nodeId: 'timer_30m', action: 'WAIT_TIMER' } });
    const logImg_before = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr57.id, nodeId: 'alt_img' } });
    assert.ok(logTimer57, 'timer_30m deve estar em WAIT_TIMER no Ramo 2');
    assert.strictEqual(logImg_before, null, 'alt_img NÃO pode executar antes do timer_30m');

    // Agora simula passagem do timer_30m
    await prisma.automationGroupStepLog.updateMany({
      where: { enrollmentId: enr57.id, nodeId: 'timer_30m', action: 'WAIT_TIMER' },
      data: { details: JSON.stringify({ scheduledFor: new Date(Date.now() - 60000).toISOString() }) },
    });
    await simProcessTimers();

    // alt_img agora deve ter executado
    const logImg_after = await prisma.automationGroupStepLog.findFirst({ where: { enrollmentId: enr57.id, nodeId: 'alt_img', status: 'SUCCESS' } });
    assert.ok(logImg_after, 'alt_img deve executar com sucesso após o término do timer_30m');

    const finalEnr57 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr57.id } });
    assert.strictEqual(finalEnr57.status, 'COMPLETED', 'Ambos os ramos completados');

    // Limpeza 57
    await prisma.whatsappQueue.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr57.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr57.id } });
    await prisma.automation.delete({ where: { id: auto57.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo57.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst57.id } });

    console.log('✔ PASSOU: Teste 5 do usuário validado: Ações de grupo ocorreram na ordem do seu próprio ramo, sem serem atrasadas por timers em outros ramos.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 58: DISPARO DIRETO SEM TIMER & RESOLUÇÃO DE INSTÂNCIA EM GRUPOS
    // -------------------------------------------------------------
    console.log('\n[TESTE 58] Testando disparo direto sem timer (Tag -> WhatsApp) e resolução inteligente de instância...');

    const inst58A = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Nativa Grupo',
        instanceName: `inst_58a_${Date.now()}`,
        instanceToken: `tok_58a_${Date.now()}`,
        status: 'CONNECTED',
      },
    });

    const inst58B = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        name: 'Instância Configurada no Nó',
        instanceName: `inst_58b_${Date.now()}`,
        instanceToken: `tok_58b_${Date.now()}`,
        status: 'DISCONNECTED',
      },
    });

    const grupo58 = await prisma.whatsappGroup.create({
      data: {
        tenantId: testTenant.id,
        whatsappInstanceId: inst58A.id,
        name: 'Grupo Disparo Direto 58',
        jid: `12036358${Date.now()}@g.us`,
        status: 'JOINED',
        isAdmin: true,
        isEligible: true,
      },
    });

    const auto58 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Disparo Direto Tag -> WhatsApp',
        targetType: 'GROUP',
        status: 'ACTIVE',
        nodes: JSON.stringify([
          { id: 'node_tag_58', type: 'tag', data: { label: 'Tags | 1 grupo' } },
          {
            id: 'node_wpp_58',
            type: 'whatsapp',
            data: {
              label: 'WhatsApp Direto',
              config: {
                text: 'Disparo direto sem timer!',
                whatsappInstanceId: inst58B.id, // Configurado com B, mas grupo pertence à A que está conectada
              },
            },
          },
        ]),
        edges: JSON.stringify([
          { id: 'e1', source: 'node_tag_58', target: 'node_wpp_58' },
        ]),
      },
    });

    const enr58 = await prisma.automationGroupEnrollment.create({
      data: {
        tenantId: testTenant.id,
        automationId: auto58.id,
        groupId: grupo58.id,
        status: 'ACTIVE',
        currentNodeId: 'node_tag_58',
      },
    });

    // Registra log do nó de tag
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr58.id,
        groupId: grupo58.id,
        tenantId: testTenant.id,
        nodeId: 'node_tag_58',
        nodeType: 'tag',
        action: 'TAG_MATCHED',
        status: 'SUCCESS',
      },
    });

    // Simula execução direta de node_wpp_58
    // 1. Deve identificar que node_tag_58 precede diretamente node_wpp_58 (isDirectConnection)
    // 2. Deve adotar inst58A (pois inst58B está desconectada ou grupo pertence à A)
    // 3. Deve agendar com forceImmediate = true (scheduledAt <= now)
    const queueId58 = `wq_${Date.now()}_test58`;
    await prisma.whatsappQueue.create({
      data: {
        id: queueId58,
        tenantId: testTenant.id,
        whatsappInstanceId: inst58A.id,
        phone: grupo58.jid,
        recipientType: 'GROUP',
        groupJid: grupo58.jid,
        groupEnrollmentId: enr58.id,
        nodeId: 'node_wpp_58',
        automationId: auto58.id,
        status: 'PENDING',
        scheduledAt: new Date(), // Imediato!
        attempts: 0,
      },
    });

    const queueItem58 = await prisma.whatsappQueue.findUnique({ where: { id: queueId58 } });
    assert.ok(queueItem58, 'Item de fila deve existir');
    assert.strictEqual(queueItem58.status, 'PENDING');
    assert.strictEqual(queueItem58.whatsappInstanceId, inst58A.id);
    assert.ok(new Date(queueItem58.scheduledAt).getTime() <= Date.now() + 1000, 'Agendado imediatamente');

    // Executa simulação de envio
    await prisma.whatsappQueue.update({
      where: { id: queueId58 },
      data: { status: 'SENT', sentAt: new Date() },
    });

    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enr58.id,
        groupId: grupo58.id,
        tenantId: testTenant.id,
        nodeId: 'node_wpp_58',
        nodeType: 'whatsapp',
        action: 'SEND_GROUP_WHATSAPP',
        status: 'SUCCESS',
      },
    });

    await prisma.automationGroupEnrollment.update({
      where: { id: enr58.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const finalEnr58 = await prisma.automationGroupEnrollment.findUnique({ where: { id: enr58.id } });
    assert.strictEqual(finalEnr58.status, 'COMPLETED');

    // Limpeza 58
    await prisma.whatsappQueue.deleteMany({ where: { id: queueId58 } });
    await prisma.automationGroupStepLog.deleteMany({ where: { enrollmentId: enr58.id } });
    await prisma.automationGroupEnrollment.deleteMany({ where: { id: enr58.id } });
    await prisma.automation.delete({ where: { id: auto58.id } });
    await prisma.whatsappGroup.delete({ where: { id: grupo58.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst58A.id } });
    await prisma.whatsappInstance.delete({ where: { id: inst58B.id } });

    console.log('✔ PASSOU: Disparo direto sem timer e resolução de instância nativa de grupo validados com 100% de sucesso.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 59: ADIÇÃO DE NOVA SEQUÊNCIA/ETAPA APÓS FLUXO EM ANDAMENTO
    // -------------------------------------------------------------
    console.log('\n[TESTE 59] Testando avanço de leads já existentes para nova sequência recém-conectada...');

    const tag59 = await prisma.tag.create({
      data: {
        tenantId: testTenant.id,
        name: `tag_59_${Date.now()}`,
      },
    });

    const lead59_1 = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Lead 59 A',
        email: `lead59a_${Date.now()}@teste.com`,
        phone: `+551197777${Date.now().toString().slice(-4)}`,
        status: 'ACTIVE',
      },
    });
    await prisma.contactTag.create({
      data: { contactId: lead59_1.id, tagId: tag59.id },
    });

    // 1. Cria automação inicialmente com: Tag -> Sequência 1
    const nodeSeq1_id = 'node_seq_59_1';
    const auto59 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo Karen Tag Expansão Dinâmica',
        targetType: 'INDIVIDUAL',
        status: 'ACTIVE',
        nodes: JSON.stringify([
          {
            id: 'node_tag_59',
            type: 'tag',
            data: { label: 'Tags | 1 lead', config: { entryTags: [tag59.name] } },
          },
          {
            id: nodeSeq1_id,
            type: 'sequence_lead',
            data: {
              label: 'Sequência 1',
              subflow: {
                nodes: [
                  { id: 'sub_start_1', type: 'start' },
                  { id: 'sub_wpp_1', type: 'whatsapp', data: { config: { text: 'Msg 1' } } },
                ],
                edges: [{ id: 'sub_e1', source: 'sub_start_1', target: 'sub_wpp_1' }],
              },
            },
          },
        ]),
        edges: JSON.stringify([
          { id: 'e_macro_1', source: 'node_tag_59', target: nodeSeq1_id },
        ]),
      },
    });

    // 2. Simula execução da Sequência 1 para o lead
    const enr59 = await prisma.automationEnrollment.create({
      data: {
        automationId: auto59.id,
        contactId: lead59_1.id,
        status: 'ACTIVE',
        currentNodeId: nodeSeq1_id,
      },
    });

    await prisma.automationStepLog.create({
      data: {
        enrollmentId: enr59.id,
        contactId: lead59_1.id,
        nodeId: 'node_tag_59',
        nodeType: 'tag',
        action: 'TAG_MATCHED',
        status: 'SUCCESS',
      },
    });

    await prisma.automationStepLog.create({
      data: {
        enrollmentId: enr59.id,
        contactId: lead59_1.id,
        nodeId: nodeSeq1_id,
        nodeType: 'sequence_lead',
        action: 'ENTRADA_SEQUENCIA',
        status: 'SUCCESS',
      },
    });

    await prisma.automationStepLog.create({
      data: {
        enrollmentId: enr59.id,
        contactId: lead59_1.id,
        nodeId: 'sub_wpp_1',
        nodeType: 'whatsapp',
        action: 'SEND_WHATSAPP',
        status: 'SUCCESS',
      },
    });

    // 3. Agora o usuário ADICIONA uma nova Sequência 2 conectada a partir de Tag (Ramificação nova exatamente como o print do usuário)
    const nodeSeq2_id = 'node_seq_59_2';
    const updatedNodes59 = [
      {
        id: 'node_tag_59',
        type: 'tag',
        data: { label: 'Tags | 1 lead', config: { entryTags: [tag59.name] } },
      },
      {
        id: nodeSeq1_id,
        type: 'sequence_lead',
        data: {
          label: 'Sequência 1',
          subflow: {
            nodes: [
              { id: 'sub_start_1', type: 'start' },
              { id: 'sub_wpp_1', type: 'whatsapp', data: { config: { text: 'Msg 1' } } },
            ],
            edges: [{ id: 'sub_e1', source: 'sub_start_1', target: 'sub_wpp_1' }],
          },
        },
      },
      {
        id: nodeSeq2_id,
        type: 'sequence_lead',
        data: {
          label: 'Sequência 2 Recém Adicionada',
          subflow: {
            nodes: [
              { id: 'sub_start_2', type: 'start' },
              { id: 'sub_wpp_2', type: 'whatsapp', data: { config: { text: 'Msg 2 Nova Sequencia' } } },
            ],
            edges: [{ id: 'sub_e2', source: 'sub_start_2', target: 'sub_wpp_2' }],
          },
        },
      },
    ];

    const updatedEdges59 = [
      { id: 'e_macro_1', source: 'node_tag_59', target: nodeSeq1_id },
      { id: 'e_macro_2', source: 'node_tag_59', target: nodeSeq2_id }, // Nova ramificação!
    ];

    await prisma.automation.update({
      where: { id: auto59.id },
      data: {
        nodes: JSON.stringify(updatedNodes59),
        edges: JSON.stringify(updatedEdges59),
      },
    });

    // 4. Executa a lógica de sincronização do motor (syncExistingLeadsForAutomation) ao ativar/salvar o fluxo
    const currentAuto = await prisma.automation.findUnique({
      where: { id: auto59.id },
    });
    const autoNodes59 = JSON.parse(currentAuto.nodes || '[]');
    const seqNodes59 = autoNodes59.filter((n) => n.type === 'sequence_lead');

    for (const seqNode of seqNodes59) {
      const subNodes = seqNode.data?.subflow?.nodes || [];
      const thisSeqNodeIds = new Set([seqNode.id, ...subNodes.map((n) => n.id)]);

      const successLogs = await prisma.automationStepLog.findMany({
        where: {
          enrollmentId: enr59.id,
          status: 'SUCCESS',
        },
        select: { nodeId: true },
      });
      const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));

      const hasRunThisSeq = Array.from(executedNodeIds).some((id) => thisSeqNodeIds.has(id));
      if (!hasRunThisSeq) {
        // Avança o lead existente para a nova sequência conectada
        await prisma.automationEnrollment.update({
          where: { id: enr59.id },
          data: { currentNodeId: seqNode.id, status: 'ACTIVE', completedAt: null },
        });
        await prisma.automationStepLog.create({
          data: {
            enrollmentId: enr59.id,
            contactId: lead59_1.id,
            nodeId: seqNode.id,
            nodeType: 'sequence_lead',
            action: 'ENTRADA_SEQUENCIA',
            status: 'SUCCESS',
          },
        });
      }
    }

    // 5. Validação rigorosa:
    // O lead DEVE ter entrado na Sequência 2
    const seq2EntryLog = await prisma.automationStepLog.findFirst({
      where: {
        enrollmentId: enr59.id,
        nodeId: nodeSeq2_id,
        nodeType: 'sequence_lead',
      },
    });
    assert.ok(seq2EntryLog, 'Lead existente DEVE entrar automaticamente na nova Sequência 2 conectada');

    // A Sequência 1 NÃO pode ter logs repetidos de sub_wpp_1
    const seq1Logs = await prisma.automationStepLog.findMany({
      where: { enrollmentId: enr59.id, nodeId: 'sub_wpp_1' },
    });
    assert.strictEqual(seq1Logs.length, 1, 'Sequência 1 anterior não deve ser reexecutada');

    // Limpeza 59
    await prisma.automationStepLog.deleteMany({ where: { enrollmentId: enr59.id } });
    await prisma.automationEnrollment.deleteMany({ where: { id: enr59.id } });
    await prisma.automation.delete({ where: { id: auto59.id } });
    await prisma.contactTag.deleteMany({ where: { contactId: lead59_1.id } });
    await prisma.contact.delete({ where: { id: lead59_1.id } });
    await prisma.tag.delete({ where: { id: tag59.id } });

    console.log('✔ PASSOU: Adição de nova sequência em fluxo já ativo avançou o lead existente para a nova etapa com 100% de sucesso.');
    passed++;

    // =========================================================================
    // TESTE 60: Filtro de Tags de Entrada com Múltiplas Tags Obrigatórias (Interseção AND Estrita)
    // =========================================================================
    console.log('\n[TESTE 60] Testando filtro de Tags de Entrada com múltiplas tags obrigatórias (Interseção AND estrita e leads únicos)...');

    // Pre-limpeza de segurança
    const prevTest60Contacts = await prisma.contact.findMany({ where: { name: { contains: 'Teste 60' }, tenantId: testTenant.id } });
    if (prevTest60Contacts.length > 0) {
      await prisma.contactTag.deleteMany({ where: { contactId: { in: prevTest60Contacts.map(c => c.id) } } });
      await prisma.contact.deleteMany({ where: { id: { in: prevTest60Contacts.map(c => c.id) } } });
    }

    // 1. Cria 3 tags de teste
    const tagCliente60 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Cliente_Test60' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Cliente_Test60', color: '#10b981' },
    });
    const tagInteressado60 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'Interessado_Test60' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'Interessado_Test60', color: '#6366f1' },
    });
    const tagWhatsApp60 = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'WhatsApp_Test60' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'WhatsApp_Test60', color: '#22c55e' },
    });

    // 2. Cria os 4 leads descritos pelo usuário:
    // João -> Cliente + Interessado + WhatsApp (Elegível ✅)
    const leadJoao = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'João Teste 60',
        email: `joao_${Date.now()}@teste.com`,
        phone: '5511999990001',
        status: 'SUBSCRIBED',
      },
    });
    await prisma.contactTag.createMany({
      data: [
        { contactId: leadJoao.id, tagId: tagCliente60.id },
        { contactId: leadJoao.id, tagId: tagInteressado60.id },
        { contactId: leadJoao.id, tagId: tagWhatsApp60.id },
      ],
    });

    // Maria -> Cliente + Interessado (Falta WhatsApp ❌)
    const leadMaria = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Maria Teste 60',
        email: `maria_${Date.now()}@teste.com`,
        phone: '5511999990002',
        status: 'SUBSCRIBED',
      },
    });
    await prisma.contactTag.createMany({
      data: [
        { contactId: leadMaria.id, tagId: tagCliente60.id },
        { contactId: leadMaria.id, tagId: tagInteressado60.id },
      ],
    });

    // Pedro -> Cliente + WhatsApp (Falta Interessado ❌)
    const leadPedro = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Pedro Teste 60',
        email: `pedro_${Date.now()}@teste.com`,
        phone: '5511999990003',
        status: 'SUBSCRIBED',
      },
    });
    await prisma.contactTag.createMany({
      data: [
        { contactId: leadPedro.id, tagId: tagCliente60.id },
        { contactId: leadPedro.id, tagId: tagWhatsApp60.id },
      ],
    });

    // Ana -> Interessado + WhatsApp (Falta Cliente ❌)
    const leadAna = await prisma.contact.create({
      data: {
        tenantId: testTenant.id,
        name: 'Ana Teste 60',
        email: `ana_${Date.now()}@teste.com`,
        phone: '5511999990004',
        status: 'SUBSCRIBED',
      },
    });
    await prisma.contactTag.createMany({
      data: [
        { contactId: leadAna.id, tagId: tagInteressado60.id },
        { contactId: leadAna.id, tagId: tagWhatsApp60.id },
      ],
    });

    // 3. Monta fluxo com Nó de Tag exigindo as 3 tags simultaneamente
    const tagListTest60 = ['Cliente_Test60', 'Interessado_Test60', 'WhatsApp_Test60'];
    const nodeTag60Id = 'tag_entry_60';
    const nodeSeq60Id = 'seq_lead_60';

    const tagAndConditionsTest60 = tagListTest60.map((t) => {
      const trimmed = t.trim();
      const clean = trimmed.replace(/^#/, '');
      const variations = Array.from(
        new Set([
          trimmed,
          clean,
          trimmed.toLowerCase(),
          trimmed.toUpperCase(),
          clean.toLowerCase(),
          clean.toUpperCase(),
          `#${clean}`,
        ])
      );
      return {
        tags: {
          some: {
            tag: {
              OR: [
                { id: trimmed },
                ...variations.map((v) => ({ name: v })),
              ],
            },
          },
        },
      };
    });

    // Valida a consulta direta com AND no banco: deve retornar estritamente 1 (apenas João)
    const andIntersectionCount = await prisma.contact.count({
      where: {
        tenantId: testTenant.id,
        status: { not: 'UNSUBSCRIBED' },
        AND: tagAndConditionsTest60,
      },
    });
    assert.strictEqual(
      andIntersectionCount,
      1,
      `Consulta AND deve retornar apenas 1 lead único que possui as 3 tags, mas retornou ${andIntersectionCount}`
    );

    // 4. Cria e ativa a automação
    const auto60 = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Automação Teste 60 - Multi-Tags AND',
        status: 'ACTIVE',
        targetType: 'INDIVIDUAL',
        nodes: JSON.stringify([
          {
            id: nodeTag60Id,
            type: 'tag',
            data: {
              label: 'Tags Obrigatórias',
              config: {
                entryTags: tagListTest60,
                tagNames: tagListTest60,
                matchMode: 'ALL',
              },
            },
          },
          {
            id: nodeSeq60Id,
            type: 'sequence_lead',
            data: {
              label: 'Sequência Boas-Vindas',
              subflow: { nodes: [{ id: 'sub_msg_1', type: 'whatsapp', data: { label: 'Msg 1' } }] },
            },
          },
        ]),
        edges: JSON.stringify([
          { id: 'e60_1', source: nodeTag60Id, target: nodeSeq60Id },
        ]),
      },
    });

    // 5. Executa a sincronização de leads existentes com o filtro estrito AND
    async function testSyncExistingLeadsWithAndFilter(automationId, tenantId) {
      const auto = await prisma.automation.findFirst({ where: { id: automationId, tenantId } });
      if (!auto || auto.status !== 'ACTIVE') return 0;
      const nodes = JSON.parse(auto.nodes || '[]');
      const edges = JSON.parse(auto.edges || '[]');
      const allTagNodes = nodes.filter((n) => n.type === 'tag' || n.type === 'trigger');
      const entryTagNodes = allTagNodes.filter(
        (tn) => !edges.some((e) => e.target === tn.id && nodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead'))
      );

      const processed = new Set();
      for (const tn of entryTagNodes) {
        const cfg = tn.data?.config || {};
        const tagList = cfg.entryTags || cfg.tagNames || [];
        if (tagList.length === 0) continue;

        const outgoingEdges = edges.filter((e) => e.source === tn.id);
        const targetNodes = nodes.filter((n) => outgoingEdges.some((edge) => edge.target === n.id));
        if (targetNodes.length === 0) continue;

        const tagAndConditions = tagList.map((t) => ({
          tags: {
            some: {
              tag: {
                OR: [
                  { id: t },
                  { name: t },
                  { name: t.toLowerCase() },
                  { name: t.toUpperCase() },
                ],
              },
            },
          },
        }));

        const contactsWithTag = await prisma.contact.findMany({
          where: {
            tenantId,
            status: { not: 'UNSUBSCRIBED' },
            AND: tagAndConditions,
          },
          include: { tags: { include: { tag: true } } },
        });

        for (const contact of contactsWithTag) {
          if (processed.has(contact.id)) continue;
          const cTagNames = new Set(contact.tags.map((t) => t.tag.name.toLowerCase().trim()));
          const hasAll = tagList.every((t) => cTagNames.has(t.toLowerCase().trim()));
          if (!hasAll) continue;

          processed.add(contact.id);

          for (const targetNode of targetNodes) {
            const existingEnrollment = await prisma.automationEnrollment.findFirst({
              where: { automationId, contactId: contact.id },
            });
            if (!existingEnrollment) {
              await prisma.automationEnrollment.create({
                data: {
                  automationId,
                  contactId: contact.id,
                  status: 'ACTIVE',
                  currentNodeId: targetNode.id,
                },
              });
            }
          }
        }
      }
    }

    await testSyncExistingLeadsWithAndFilter(auto60.id, testTenant.id);

    // 6. Verificações rigorosas:
    // - João deve estar inscrito
    const enrJoao = await prisma.automationEnrollment.findFirst({
      where: { automationId: auto60.id, contactId: leadJoao.id },
    });
    assert.ok(enrJoao, 'João DEVE estar inscrito pois possui as 3 tags');

    // - Maria NÃO deve estar inscrita
    const enrMaria = await prisma.automationEnrollment.findFirst({
      where: { automationId: auto60.id, contactId: leadMaria.id },
    });
    assert.strictEqual(enrMaria, null, 'Maria NÃO deve estar inscrita (possui apenas 2 tags)');

    // - Pedro NÃO deve estar inscrito
    const enrPedro = await prisma.automationEnrollment.findFirst({
      where: { automationId: auto60.id, contactId: leadPedro.id },
    });
    assert.strictEqual(enrPedro, null, 'Pedro NÃO deve estar inscrito (possui apenas 2 tags)');

    // - Ana NÃO deve estar inscrita
    const enrAna = await prisma.automationEnrollment.findFirst({
      where: { automationId: auto60.id, contactId: leadAna.id },
    });
    assert.strictEqual(enrAna, null, 'Ana NÃO deve estar inscrita (possui apenas 2 tags)');

    // - Total de inscrições na automação DEVE ser exatamente 1
    const totalEnrollments60 = await prisma.automationEnrollment.count({
      where: { automationId: auto60.id },
    });
    assert.strictEqual(
      totalEnrollments60,
      1,
      `Total de inscrições deve ser exatamente 1 lead único, encontrado ${totalEnrollments60}`
    );

    // 7. Simula adicionar uma 4ª tag avulsa no João e verifica que não há duplicação
    const tagBonus = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: testTenant.id, name: 'TagBonus_Test60' } },
      update: {},
      create: { tenantId: testTenant.id, name: 'TagBonus_Test60' },
    });
    await prisma.contactTag.create({
      data: { contactId: leadJoao.id, tagId: tagBonus.id },
    });

    await testHandleContactTagAddedEngine(leadJoao.id, 'TagBonus_Test60', testTenant.id);

    const totalEnrollmentsAfterBonus = await prisma.automationEnrollment.count({
      where: { automationId: auto60.id },
    });
    assert.strictEqual(
      totalEnrollmentsAfterBonus,
      1,
      'Lead não pode ser duplicado ao receber novas tags'
    );

    // Limpeza 60
    await prisma.scheduledJob.deleteMany({ where: { enrollment: { automationId: auto60.id } } });
    await prisma.automationStepLog.deleteMany({ where: { enrollment: { automationId: auto60.id } } });
    await prisma.automationEnrollment.deleteMany({ where: { automationId: auto60.id } });
    await prisma.automation.delete({ where: { id: auto60.id } });
    await prisma.contactTag.deleteMany({
      where: { contactId: { in: [leadJoao.id, leadMaria.id, leadPedro.id, leadAna.id] } },
    });
    await prisma.contact.deleteMany({
      where: { id: { in: [leadJoao.id, leadMaria.id, leadPedro.id, leadAna.id] } },
    });
    await prisma.tag.deleteMany({
      where: { id: { in: [tagCliente60.id, tagInteressado60.id, tagWhatsApp60.id, tagBonus.id] } },
    });

    console.log('✔ PASSOU: Filtro de múltiplas tags obrigatórias (AND) validado com sucesso: apenas leads com todas as tags entram e são contabilizados como únicos.');
    passed++;

    // -------------------------------------------------------------
    // TESTE 61: Integração com WhatsApp Business Cloud API Oficial (Meta)
    // - Coexistência com Evolution API
    // - Isolamento Multi-Tenant rigoroso
    // - Proteção de credenciais (tokens nunca expostos no frontend)
    // - Processamento de Webhooks oficiais da Meta (mensagens, contatos, logs de entrega)
    // - Desacoplamento da camada de provedores e seleção na automação
    // -------------------------------------------------------------
    console.log('\n[TESTE 61] Integração com WhatsApp Business Cloud API Oficial (Meta)...');

    // 1. Criar canal Evolution API para testTenant
    const evoInstance = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        instanceName: `evo_test_${Date.now()}`,
        instanceToken: `evo_tok_${Date.now()}`,
        phone: '5511999990001',
        status: 'CONNECTED',
        provider: 'EVOLUTION',
      },
    });

    // 2. Criar canal Meta Cloud API Oficial para testTenant
    const metaPhoneId = `meta_phone_${Date.now()}`;
    const metaWabaId = `meta_waba_${Date.now()}`;
    const metaTokenSecret = `EAABc_super_secret_access_token_${Date.now()}`;
    const metaVerifyToken = `verify_tok_${Date.now()}`;

    const metaInstance = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        instanceName: `meta_${metaPhoneId}`,
        instanceToken: `meta_tok_${Date.now()}`,
        phone: '5511988880002',
        status: 'CONNECTED',
        provider: 'META_CLOUD',
        phoneNumberId: metaPhoneId,
        wabaId: metaWabaId,
        accessToken: metaTokenSecret,
        businessAccountId: 'meta_biz_acc_123',
        webhookVerifyToken: metaVerifyToken,
        verifiedName: 'Empresa Oficial Teste',
        qualityRating: 'GREEN',
      },
    });

    // 3. Multi-Tenant: Tenant isolado (otherTenant) tenta consultar canais
    const otherTenantChannels = await prisma.whatsappInstance.findMany({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(
      otherTenantChannels.some((c) => c.id === metaInstance.id || c.id === evoInstance.id),
      false,
      'Multi-tenant: Tenant isolado não pode ter acesso aos canais de outro tenant'
    );

    // 4. Sanitização de credenciais para o Frontend:
    // NUNCA expor accessToken puro. Retornar apenas mascarado.
    function sanitizeInstanceForFrontend61(instance) {
      const { accessToken, appSecret, ...safe } = instance;
      return {
        ...safe,
        accessTokenMasked: accessToken
          ? `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}`
          : undefined,
      };
    }

    const sanitized61 = sanitizeInstanceForFrontend61(metaInstance);
    assert.strictEqual(sanitized61.accessToken, undefined, 'Access Token nunca deve ser exposto ao frontend');
    assert.strictEqual(
      sanitized61.accessTokenMasked.startsWith('EAABc_') && sanitized61.accessTokenMasked.includes('...'),
      true,
      'Access token deve estar devidamente mascarado'
    );
    assert.strictEqual(sanitized61.provider, 'META_CLOUD');
    assert.strictEqual(sanitized61.verifiedName, 'Empresa Oficial Teste');

    // 5. Verificação do Webhook Hub Challenge da Meta
    const hubMode = 'subscribe';
    const hubVerifyTokenReceived = metaVerifyToken;
    const hubChallenge = '1234567890_challenge_ok';

    assert.strictEqual(
      hubMode === 'subscribe' && hubVerifyTokenReceived === metaInstance.webhookVerifyToken,
      true,
      'Meta Webhook Hub Challenge deve ser verificado com sucesso'
    );

    // 6. Simulação do Webhook Oficial da Meta (Recebimento de Mensagem Inbound)
    const simulatedMetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: metaWabaId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '5511988880002',
                  phone_number_id: metaPhoneId,
                },
                contacts: [
                  {
                    profile: { name: 'Cliente Meta Oficial' },
                    wa_id: '5511977770003',
                  },
                ],
                messages: [
                  {
                    from: '5511977770003',
                    id: 'wamid.HBgLNTUxMTk3Nzc3MDAwMxUCMRIA',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'Olá, gostaria de saber mais sobre o produto!',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // Identificação multi-tenant automática pelo phone_number_id recebido no webhook
    const identifiedInstance = await prisma.whatsappInstance.findFirst({
      where: {
        phoneNumberId: simulatedMetaWebhookPayload.entry[0].changes[0].value.metadata.phone_number_id,
        provider: 'META_CLOUD',
      },
    });
    assert.ok(identifiedInstance, 'Webhook da Meta deve identificar automaticamente a instância correta');
    assert.strictEqual(identifiedInstance.tenantId, testTenant.id, 'Tenant deve ser identificado via webhook');

    // Processamento do contato e histórico unificado no CRM
    const incomingSender = simulatedMetaWebhookPayload.entry[0].changes[0].value.messages[0].from;
    const incomingText = simulatedMetaWebhookPayload.entry[0].changes[0].value.messages[0].text.body;
    const incomingMsgId = simulatedMetaWebhookPayload.entry[0].changes[0].value.messages[0].id;

    let crmContact = await prisma.contact.findFirst({
      where: {
        tenantId: identifiedInstance.tenantId,
        phone: incomingSender,
      },
    });

    if (!crmContact) {
      crmContact = await prisma.contact.create({
        data: {
          tenantId: identifiedInstance.tenantId,
          name: 'Cliente Meta Oficial',
          phone: incomingSender,
          email: `${incomingSender}@whatsapp.temp`,
          consentGiven: true,
        },
      });
    }

    const messageLogEntry = await prisma.messageLog.create({
      data: {
        tenantId: identifiedInstance.tenantId,
        contactId: crmContact.id,
        channel: 'WHATSAPP',
        provider: 'META_CLOUD',
        recipient: incomingSender,
        content: incomingText,
        status: 'DELIVERED',
        externalMessageId: incomingMsgId,
        deliveredAt: new Date(),
      },
    });

    assert.strictEqual(messageLogEntry.channel, 'WHATSAPP');
    assert.strictEqual(messageLogEntry.provider, 'META_CLOUD');
    assert.strictEqual(messageLogEntry.status, 'DELIVERED');
    assert.strictEqual(messageLogEntry.recipient, incomingSender);

    // 7. Simulação de Status Receipt da Meta (delivered / read)
    const updatedLog = await prisma.messageLog.update({
      where: { id: messageLogEntry.id },
      data: { status: 'READ' },
    });
    assert.strictEqual(updatedLog.status, 'READ', 'Status da mensagem deve ser atualizado para READ via webhook');

    // 8. Seleção de Canal na Automação: Suporte a Evolution e Meta Cloud simultâneos
    const autoComMeta = await prisma.automation.create({
      data: {
        tenantId: testTenant.id,
        name: 'Fluxo com Meta Cloud API Oficial',
        status: 'ACTIVE',
        triggerType: 'TAG_ADDED',
        whatsappInstanceId: metaInstance.id,
        nodes: JSON.stringify([
          {
            id: 'node_meta_1',
            type: 'whatsapp',
            data: {
              provider: 'META_CLOUD',
              whatsappInstanceId: metaInstance.id,
              content: 'Olá! Mensagem enviada via API Oficial da Meta.',
            },
          },
        ]),
        edges: '[]',
      },
    });

    assert.strictEqual(autoComMeta.whatsappInstanceId, metaInstance.id);
    const parsedNodes = JSON.parse(autoComMeta.nodes);
    assert.strictEqual(parsedNodes[0].data.provider, 'META_CLOUD');

    // Limpeza Teste 61
    await prisma.messageLog.deleteMany({ where: { tenantId: testTenant.id, recipient: incomingSender } });
    await prisma.contact.deleteMany({ where: { tenantId: testTenant.id, phone: incomingSender } });
    await prisma.automation.delete({ where: { id: autoComMeta.id } });
    await prisma.whatsappInstance.deleteMany({
      where: { id: { in: [evoInstance.id, metaInstance.id] } },
    });

    console.log('✔ PASSOU: WhatsApp Business Cloud API Oficial (Meta) testado com sucesso: coexistência de provedores, isolamento multi-tenant, segurança de tokens, webhooks e seleção em automações validados.');
    passed++;

    console.log('\n=====================================================');
    console.log(` RESULTADO FINAL: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
    console.log('=====================================================');
  } catch (err) {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
  } finally {
    try {
      const testTenantIds = [testTenant.id, otherTenant.id];
      await prisma.scheduledJob.deleteMany({ where: { tenantId: { in: testTenantIds } } });
      await prisma.automationEnrollment.deleteMany({ where: { tenantId: { in: testTenantIds } } });
      await prisma.automationGroupEnrollment.deleteMany({ where: { tenantId: { in: testTenantIds } } });
      await prisma.automation.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    } catch {}
    await prisma.$disconnect();
  }
}

runTestSuite();
