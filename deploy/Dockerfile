# Static site image: Eleventy builds the site, nginx serves the output.
# Built by .github/workflows/deploy.yml for linux/arm64 (the Oracle VM).

# ---- Build: npm run build -> /src/_site ----
# The output is plain files, so this stage runs on the builder's own platform
# (no emulation when cross-building) and only _site is carried over.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Serve ----
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/_site/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

EXPOSE 80
