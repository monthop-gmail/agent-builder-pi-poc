# syntax=docker/dockerfile:1
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build

ENV PATH="/app/node_modules/.bin:${PATH}"
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["inspect", "manifest/examples/researcher.yaml"]
