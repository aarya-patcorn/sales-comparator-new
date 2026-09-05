FROM node:20-bookworm-slim

WORKDIR /app

# Copy the schema before npm ci because postinstall runs prisma generate.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start:prod"]
