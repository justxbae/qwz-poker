FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY public/ ./public/
COPY vendor/pokersolver/pokersolver.js vendor/pokersolver/package.json vendor/pokersolver/LICENSE.md ./vendor/pokersolver/
COPY vendor/poker-kernel/ ./vendor/poker-kernel/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server/index.js"]
