const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Verificando / Inicializando Dados Essenciais ---');

  // Garante a existência do usuário do administrador
  const adminEmail = 'carloshenrq1245@gmail.com';
  let admin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!admin) {
    const passwordHash = await bcrypt.hash('12277891', 10);
    admin = await prisma.user.create({
      data: {
        name: 'Carlos Henrique',
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
      },
    });
    console.log('✔ Usuário admin criado:', admin.email);
  } else {
    console.log('✔ Usuário admin já existe:', admin.email);
  }

  // Garante pelo menos 1 tenant/expert cadastrado
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Meu Expert Principal',
        slug: 'expert-principal',
        description: 'Ambiente principal para lançamentos digitais',
        emailSender: 'contato@seudominio.com',
        status: 'ACTIVE',
      },
    });
    console.log('✔ Expert inicial criado:', tenant.name);
  } else {
    console.log('✔ Expert encontrado:', tenant.name);
  }

  // Garante associação do usuário ao tenant
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: admin.id, tenantId: tenant.id },
  });

  if (!membership) {
    await prisma.tenantMembership.create({
      data: {
        userId: admin.id,
        tenantId: tenant.id,
        role: 'ADMIN',
      },
    });
    console.log('✔ Vínculo de membro criado para o admin');
  }

  console.log('--- Inicialização concluída com sucesso ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
