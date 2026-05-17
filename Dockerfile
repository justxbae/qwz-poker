FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server/index.js"]
