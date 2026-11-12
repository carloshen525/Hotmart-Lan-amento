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

# Ao subir o container no Easypanel: sincroniza banco, cria usuário se necessário e inicia o servidor
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node prisma/seed.js && npm run start"]
