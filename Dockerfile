FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm run prisma:generate

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
