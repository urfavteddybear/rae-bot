FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .
COPY --from=web /web/dist ./web/dist

# The profile database lives here; mount a volume on it so it survives rebuilds.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
