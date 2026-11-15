const { PrismaClient } = require('@prisma/client');

async function syncWhatsappInstances() {
  const prisma = new PrismaClient();
  const apiUrl = (process.env.EVOLUTION_API_URL || 'https://prospeccao-evolution01.pesd8y.easypanel.host')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/$/, '');
  const apiKey = (process.env.EVOLUTION_API_KEY || 'X9mK2vQ7LpR8aNc4HsT1yWf6BgZe3JuD')
    .trim()
    .replace(/^["']|["']$/g, '');

  console.log('[SYNC] Verificando conexões ativas na Evolution API...');

  try {
    const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!tenant) {
      console.log('[SYNC] Nenhum tenant cadastrado no banco ainda. Sincronização adiada.');
      return;
    }

    const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[SYNC] Evolution API retornou status ${res.status}`);
      return;
    }

    const evoData = await res.json().catch(() => []);
    if (!Array.isArray(evoData) || evoData.length === 0) {
      console.log('[SYNC] Nenhuma instância retornada pela Evolution API.');
      return;
    }

    console.log(`[SYNC] ${evoData.length} instâncias encontradas na Evolution API.`);

    let syncedCount = 0;
    for (const evo of evoData) {
      const evoName = (evo.name || evo.instanceName || evo.instance?.name || evo.instance?.instanceName || '').trim();
      if (!evoName) continue;

      const evoState = String(
        evo.connectionStatus ||
        evo.state ||
        evo.status ||
        evo.instance?.state ||
        evo.instance?.status ||
        'close'
      ).toLowerCase();
      const isConnected = evoState === 'open' || evoState === 'connected';

      const rawPhone = evo.ownerJid ? evo.ownerJid.replace(/@.*$/, '') : '';
      const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : null;
      const profileName = evo.profileName || (phone ? `WhatsApp ${phone}` : 'WhatsApp');

      const existing = await prisma.whatsappInstance.findFirst({
        where: {
          OR: [
            { instanceName: evoName },
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

      if (existing) {
        await prisma.whatsappInstance.update({
          where: { id: existing.id },
          data: {
            instanceName: evoName,
            status: isConnected ? 'CONNECTED' : (evoState === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'),
            phone: phone || existing.phone,
            profileName: profileName || existing.profileName,
            lastConnectedAt: isConnected ? new Date() : existing.lastConnectedAt,
            qrcode: isConnected ? null : existing.qrcode,
          },
        });
        syncedCount++;
        console.log(`[SYNC] Instância atualizada: ${evoName} (${isConnected ? 'CONECTADO' : evoState})`);
      } else if (isConnected || evoState === 'connecting') {
        const totalCount = await prisma.whatsappInstance.count({ where: { tenantId: tenant.id } });
        await prisma.whatsappInstance.create({
          data: {
            tenantId: tenant.id,
            name: profileName + (phone ? ` (${phone})` : ''),
            instanceName: evoName,
            instanceToken: evo.token || 'tok_' + Math.random().toString(36).substring(2),
            status: isConnected ? 'CONNECTED' : 'CONNECTING',
            phone,
            profileName,
            isDefault: totalCount === 0,
            lastConnectedAt: isConnected ? new Date() : null,
            qrcode: null,
          },
        });
        syncedCount++;
        console.log(`[SYNC] Nova instância cadastrada no tenant ${tenant.id}: ${evoName} (${phone || 'sem fone'})`);
      }
    }

    console.log(`[SYNC] Sincronização concluída com sucesso: ${syncedCount} instâncias sincronizadas.`);
  } catch (err) {
    console.warn('[SYNC] Aviso durante sincronização com Evolution API:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  syncWhatsappInstances()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SYNC] Falha fatal:', err.message);
      process.exit(0);
    });
}

module.exports = { syncWhatsappInstances };
