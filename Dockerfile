FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# install production dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

# persistent data (users, sessions, admin config) lives in /app/data
RUN mkdir -p /app/data && chown -R node:node /app
ENV DATA_DIR=/app/data \
    PORT=3000
VOLUME ["/app/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
