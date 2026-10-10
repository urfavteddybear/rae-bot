FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .
COPY --from=web /web/dist ./web/dist

USER node

EXPOSE 3000
CMD ["node", "src/index.js"]
