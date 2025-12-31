# Production-grade static site container
# - nginx serving on 8080 (container-friendly)
# - hardened headers via nginx.confsss
# - small footprint (alpine)

FROM nginx:alpine

# Replace default config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static site
COPY . /usr/share/nginx/html

# Remove files not needed at runtime (optional hygiene)
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/.dockerignore /usr/share/nginx/html/README.md || true

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# nginx runs in foreground
CMD ["nginx", "-g", "daemon off;"]
