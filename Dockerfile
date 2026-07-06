# --- budowanie ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# standalone server + statyki
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# prisma CLI do inicjalizacji schematu (db push) przy starcie
COPY --from=builder /app/prisma ./prisma
RUN npm install --no-save --no-audit --no-fund prisma@6

# katalogi na dane (wolumeny)
RUN mkdir -p /app/data /app/public/uploads

EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
