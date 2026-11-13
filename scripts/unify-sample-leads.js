const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const unifiedTagName = 'Cliente: Imersão Busca e Apreensão de Veículos - Compra Aprovada';
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error('No tenant found');
  const tenantId = tenant.id;

  // Criar ou obter a tag unificada
  let unifiedTag = await prisma.tag.findUnique({
    where: { tenantId_name: { tenantId, name: unifiedTagName } },
  });
  if (!unifiedTag) {
    unifiedTag = await prisma.tag.create({
      data: { tenantId, name: unifiedTagName, color: '#10b981' },
    });
  }

  // Achar os 18 leads da planilha
  const emails = [
    'pablloguylherme1999@gmail.com', 'janainaribeiro9@hotmail.com', 'andrealzonne@gmail.com',
    'adrianoxavier5@hotmail.com', 'brucixavier01@gmail.com', 'sel_siq@outlook.com',
    'fernandobettine@hotmail.com', 'dredsonsantanaadvogado@gmail.com', 'krcf.adv@gmail.com',
    'lucileiasilva@hotmail.com', 'paulodeiro@yahoo.com.br', 'veronicaap.chagas@gmail.com',
    'advjeovavasconcelos@gmail.com', 'susanavilanovacamilo@gmail.com', 'marcellosillvaadv@yahoo.com',
    'josielicavichioli@gmail.com', 'jakson.bruno@icloud.com', 'claudiofreitas2011@gmail.com'
  ];

  const contacts = await prisma.contact.findMany({
    where: { email: { in: emails } },
    include: { tags: { include: { tag: true } } },
  });

  console.log('Encontrados:', contacts.length, 'contatos para unificar');

  // Tags soltas a remover desses contatos
  const looseTagNames = ['Cliente', 'Compra Aprovada'];
  const looseTags = await prisma.tag.findMany({
    where: { tenantId, name: { in: looseTagNames } },
  });
  const looseTagIds = looseTags.map((t) => t.id);

  for (const c of contacts) {
    // Adicionar tag unificada
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: c.id, tagId: unifiedTag.id } },
      create: { contactId: c.id, tagId: unifiedTag.id },
      update: {},
    });

    // Remover tags soltas para evitar duplicidade
    if (looseTagIds.length > 0) {
      await prisma.contactTag.deleteMany({
        where: {
          contactId: c.id,
          tagId: { in: looseTagIds },
        },
      });
    }
  }

  console.log('Migração concluída com sucesso!');
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
