# Étape 1 : compilation de l'interface Vue (dépendances de développement uniquement ici)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY client ./client
COPY shared ./shared
RUN npm run build

# Étape 2 : image finale, avec seulement le serveur et l'interface compilée
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/session || exit 1
CMD ["node", "src/server.js"]
