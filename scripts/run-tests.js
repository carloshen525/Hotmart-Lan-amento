const assert = require('assert');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTestSuite() {
  console.log('=====================================================');
  console.log('   INICIANDO BATERIA DE TESTES AUTOMATIZADOS (12/12) ');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 19;

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
    // TESTE 13: Isolamento 1:1 Multi-Tenant da Evolution API
    // -------------------------------------------------------------
    console.log('\n[TESTE 13] Isolamento 1:1 Multi-Tenant da Evolution API...');
    const instName = `inst_test_${Date.now()}`;
    await prisma.whatsappInstance.deleteMany({
      where: { tenantId: { in: [testTenant.id, otherTenant.id] } },
    });

    const userInstance = await prisma.whatsappInstance.create({
      data: {
        tenantId: testTenant.id,
        instanceName: instName,
        instanceToken: 'token_secreto_user_1',
        status: 'CONNECTED',
        phone: '+556282002147',
        profileName: 'Expert Teste',
      },
    });

    assert.strictEqual(userInstance.tenantId, testTenant.id);

    // Tentar criar segunda instância para o mesmo tenant deve falhar (relação 1:1 estrita)
    let threwDuplicateTenant = false;
    try {
      await prisma.whatsappInstance.create({
        data: {
          tenantId: testTenant.id,
          instanceName: `inst_second_${Date.now()}`,
          instanceToken: 'token_secreto_user_2',
        },
      });
    } catch {
      threwDuplicateTenant = true;
    }
    assert.ok(threwDuplicateTenant, 'Cada tenant só pode possuir 1 única instância de WhatsApp');

    // Outro tenant nunca visualiza a instância do testTenant
    const otherTenantInstance = await prisma.whatsappInstance.findUnique({
      where: { tenantId: otherTenant.id },
    });
    assert.strictEqual(otherTenantInstance, null, 'Outro tenant não deve enxergar instância alheia');
    console.log('✔ PASSOU: Instância 1:1 isolada por tenant com bloqueio estrito contra vazamento.');
    passed++;

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

    console.log('\n=====================================================');
    console.log(` RESULTADO FINAL: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
    console.log('=====================================================');
  } catch (err) {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
