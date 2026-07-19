FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .

FROM base AS development
ENV EXPO_NO_TYPESCRIPT_SETUP=1
USER node
EXPOSE 8082
CMD ["npm", "start", "--", "--port", "8082"]

FROM base AS checks
ENV EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
RUN npm run verify
CMD ["npm", "run", "verify"]
