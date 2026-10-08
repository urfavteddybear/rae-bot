FROM node:20-alpine AS base
WORKDIR /app

# Install native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json .
RUN npm install --omit=dev

COPY . .

# Create data dir for SQLite
RUN mkdir -p /app/data

CMD ["node", "src/index.js"]
