FROM node:20-slim AS base

# Dependências nativas necessárias para o Prisma Engine
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalação limpa de dependências
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copia o restante do código fonte
COPY . .

# Gera o client do Prisma e compila o Next.js para produção
RUN npx prisma generate
RUN npm run build

# Configuração de portas e ambiente
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Ao subir o container: executa o script de inicialização resiliente com migrações seguras e bind 0.0.0.0
CMD ["node", "scripts/start.js"]
