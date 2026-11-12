# LaunchFlow - Plataforma de Automação para Lançamentos Digitais & Hotmart

Plataforma SaaS multi-tenant focada no ecossistema de lançamentos digitais brasileiros (alternativa simples, robusta e econômica a LeadLovers, SendPulse e ActiveCampaign).

---

## 1. Arquitetura e Estrutura Técnica

- **Frontend & Fullstack Framework**: Next.js 14 (App Router) com TypeScript e Tailwind CSS.
- **Editor Visual de Automações**: React Flow (`@xyflow/react`) com nós customizados (Gatilhos, Ações, Condições SE/SENÃO com portas Sim/Não, Temporizadores com cancelamento atômico e Simulador interativo).
- **Banco de Dados & Persistência**: Prisma ORM configurado com SQLite local out-of-the-box (`dev.db`) e facilmente chaveável para PostgreSQL em produção via `DATABASE_URL`.
- **Isolamento Multi-Tenant**: Cada Expert tem seu próprio ambiente isolado (contatos, tags, webhooks Hotmart, automações, números de WhatsApp e credenciais). O gestor pode alternar entre experts no topo da aplicação instantaneamente.
- **Motor de Automações e Filas**: Fila de execução persistente no banco (`ScheduledJob`) com bloqueio atômico, retry, dead-letter e verificação de condições de cancelamento (ex: interrupção atômica de mensagens de cobrança quando a compra é confirmada).
- **Integração Hotmart 2.0**:
  - Endpoint oficial com validação do token `hottok`.
  - **Idempotência estrita**: chave única baseada em transação/evento que descarta reenvios sem duplicar ações.
  - Simulador de eventos Hotmart integrado na interface para testar aprovações de compra, abandono de carrinho e Pix sem gastar dinheiro real.
- **Mensageria Híbrida**:
  - **WhatsApp**: Suporte à Meta Cloud API oficial (Graph API v21.0) e **Provedor Simulado** ativo por padrão para testes com rastreamento de entrega, leitura e cálculo de custos.
  - **E-mail**: Suporte a Resend / SES e Provedor Simulado com rodapé de descadastro (opt-out) LGPD automático e interpolação de variáveis `{{nome}}`.

---

## 2. Estrutura de Pastas

```
├── prisma/
│   ├── schema.prisma         # Modelos multi-tenant, CRM, Automação, Hotmart e Jobs
│   ├── seed.js               # Seed com 2 experts, tags, leads e funil completo
│   └── dev.db                # Banco SQLite persistente local
├── scripts/
│   └── run-tests.js          # Suíte com 12 testes automatizados
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/         # Login, Me, Switch Tenant
│   │   │   ├── automations/  # CRUD, salvar React Flow, simulação e inscrição manual
│   │   │   ├── campaigns/    # Modelos de lançamento (Semente, Clássico, Perpétuo)
│   │   │   ├── contacts/     # CRM de leads, filtros, opt-out LGPD e exportação CSV
│   │   │   ├── dashboard/    # Métricas consolidadas e telemetria
│   │   │   ├── jobs/         # Processador de timers e agendamentos
│   │   │   ├── tags/         # Gestão de tags e contagem
│   │   │   ├── tenants/      # CRUD de experts
│   │   │   └── webhooks/     # Webhook Hotmart 2.0 e simulador
│   │   ├── automations/      # Lista de automações e Editor Visual [id]
│   │   ├── calendar/         # Cronograma de disparos da semana
│   │   ├── campaigns/        # Modelos estratégicos de lançamento
│   │   ├── contacts/         # Tela de CRM com drawer lateral
│   │   ├── emails/           # Templates e histórico de e-mail
│   │   ├── integrations/     # Tela de conexão Hotmart e simulador
│   │   ├── reports/          # Relatórios de conversão e faturamento
│   │   ├── settings/         # Configurações do expert e novo expert
│   │   ├── tags/             # Gerenciador de tags e cores
│   │   ├── whatsapp/         # Inbox e disparos WhatsApp
│   │   ├── layout.tsx        # Shell da aplicação com Sidebar e Header
│   │   └── page.tsx          # Visão Geral (Dashboard)
│   ├── components/
│   │   ├── automation/       # CustomNodes para React Flow (Gatilho, Ação, Condição, Delay)
│   │   ├── Header.tsx        # Seletor Multi-Tenant de Expert + Processar Jobs
│   │   └── Sidebar.tsx       # Menu lateral com todas as 11 seções
│   ├── lib/
│   │   ├── auth.ts           # JWT, sessões e bcrypt
│   │   ├── crypto.ts         # Criptografia AES-256-GCM para segredos
│   │   ├── prisma.ts         # Singleton do Prisma Client
│   │   └── tenancy.ts        # Isolamento estrito por expert
│   └── services/
│       ├── automation/       # Motor de execução de fluxos e scheduler
│       ├── hotmart/          # Processador de webhooks com idempotência
│       └── messaging/        # Mensageria (Simulado, Meta WhatsApp, Resend)
```

---

## 3. Instruções para Execução Local

### Passo 1: Instalar dependências (caso não estejam instaladas)
```bash
npm install
```

### Passo 2: Sincronizar o Banco e Popular Dados de Demonstração
```bash
npx prisma db push
npm run db:seed
```

### Passo 3: Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
Acesse no seu navegador: **`http://localhost:3000`**

---

## 4. Como Executar os Testes Automatizados

O projeto inclui uma bateria rigorosa de 12 testes cobrindo todas as invariantes exigidas:
```bash
npm run test
```
Resultados validados:
1. Cadastro e edição de contatos.
2. Adição e remoção atômica de tags.
3. Entrada e saída de fluxos de automação.
4. Execução de condições SE / SENÃO (ramificações Sim e Não).
5. Temporizadores persistentes no banco com condição de guarda.
6. Eventos duplicados da Hotmart (garantia de idempotência estrita).
7. Transição de status Pix -> Pagamento Aprovado.
8. Interrupção atômica de mensagens de cobrança (evita cobrar quem já pagou).
9. Falhas e limites de retentativas (dead-letter e status FAILED).
10. Separação estrita de dados entre experts (Multi-tenant).
11. Permissões de usuários e RBAC.
12. Descadastramento de mensagens (Opt-out LGPD).

---

## 5. Variáveis de Ambiente (`.env`)

```env
# Banco de Dados
DATABASE_URL="file:./dev.db" # Ou "postgresql://usuario:senha@host:5432/banco" em produção
APP_URL="http://localhost:3000"
JWT_SECRET="segredo-super-seguro-plataforma-lancamento-hotmart-2026"

# WhatsApp (SIMULATED para testar grátis ou META_CLOUD_API para oficial)
WHATSAPP_PROVIDER_MODE="SIMULATED"
META_WHATSAPP_TOKEN=""
META_WHATSAPP_PHONE_NUMBER_ID=""
META_WHATSAPP_WABA_ID=""
META_WEBHOOK_VERIFY_TOKEN="meta_webhook_verify_token_123"

# E-mail (SIMULATED ou RESEND)
EMAIL_PROVIDER_MODE="SIMULATED"
RESEND_API_KEY=""
EMAIL_FROM="suporte@expertlaunch.com.br"

# Hotmart
HOTMART_HOTTOK_SECRET="hotmart_hottok_secret_demo_2026"
```

---

## 6. Como Conectar Provedores Reais

### 1. Hotmart
1. Acesse sua conta Hotmart e vá em **Ferramentas > Webhook (API)**.
2. Copie a URL gerada na tela **Integrações** da plataforma:
   `https://seu-dominio.com/api/webhooks/hotmart?tenant=ID_DO_EXPERT`
3. Copie o token de verificação (**Hottok**) e cole nas configurações do Expert.
4. Marque os eventos: *Compra Aprovada*, *Aguardando Pagamento*, *Abandono de Carrinho*, *Cancelamento* e *Reembolso*.

### 2. WhatsApp Business (Meta Cloud API)
1. Crie um aplicativo na [Meta for Developers](https://developers.facebook.com/) do tipo Empresa.
2. Adicione o produto **WhatsApp**.
3. Obtenha o **Token Permanente do Sistema**, o **Phone Number ID** e o **WABA ID**.
4. Configure a URL de Webhook: `https://seu-dominio.com/api/webhooks/whatsapp` e o Token de Verificação configurado em `META_WEBHOOK_VERIFY_TOKEN`.
5. Altere `WHATSAPP_PROVIDER_MODE="META_CLOUD_API"` no `.env`.

### 3. E-mail (Resend / SES)
1. Crie uma conta no [Resend.com](https://resend.com) e adicione seu domínio.
2. Configure os registros DNS (SPF, DKIM e DMARC) indicados na aba **Integrações**.
3. Adicione sua chave `RESEND_API_KEY` e mude `EMAIL_PROVIDER_MODE="RESEND"`.

---

## 7. Custos Operacionais Esperados

- **WhatsApp Meta Cloud API**:
  - Mensagens de Utilidade/Confirmação: ~US$ 0.035 por conversa.
  - Mensagens de Marketing (Lançamento): ~US$ 0.0625 por conversa iniciada pela empresa.
  - Respostas dentro da janela de 24h aberta pelo usuário: gratuitas.
- **E-mail (Resend / Amazon SES)**:
  - Resend: 3.000 e-mails/mês gratuitos; após isso US$ 20 para 50.000 e-mails.
  - Amazon SES: US$ 0.10 para cada 1.000 e-mails enviados.
- **Hospedagem & Banco**:
  - Servidor Node.js (Railway, Render ou VPS com Docker): ~US$ 5 a US$ 15/mês.
