FROM node:20-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server/index.js"]
