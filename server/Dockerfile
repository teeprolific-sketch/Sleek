# Build from the repository root:  docker build -f server/Dockerfile -t sleek-api .
# The server imports the shared trust rules from ../src/domain, so both folders are copied.
FROM node:22-alpine
ENV NODE_ENV=production TZ=Africa/Lagos
RUN apk add --no-cache tzdata
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --include=dev
COPY server/ ./
COPY src/domain /app/src/domain
COPY src/data /app/src/data
COPY src/ugent/tools.ts src/ugent/types.ts /app/src/ugent/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["npx", "tsx", "src/index.ts"]
