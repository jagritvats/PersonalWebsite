# Static site image: nginx serving the files in the repo root.
# Built by .github/workflows/deploy.yml for linux/arm64 (the Oracle VM).
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# .dockerignore whitelists only the published site files, so this copies
# the page, its assets and the SEO/LLM files and nothing else.
COPY . /usr/share/nginx/html/
# deploy/nginx.conf is whitelisted only for the COPY above; don't serve it.
RUN rm -rf /usr/share/nginx/html/deploy

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

EXPOSE 80
