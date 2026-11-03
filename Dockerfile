# Hai image từ một Dockerfile:
#   target "app"      (mặc định) chỉ server Node — nhẹ, dùng cho OBS / điện thoại
#   target "streamer" thêm Chromium + Xvfb + PulseAudio + ffmpeg để VPS tự phát RTMP 24/7

# Docker Hub giới hạn lượt tải (lỗi 429)? Build với:
#   docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8686
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p data && chown node:node data

FROM base AS streamer
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb pulseaudio pulseaudio-utils ffmpeg curl ca-certificates \
      fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
ENV CHROME_BIN=/usr/bin/chromium
USER node
CMD ["bash", "deploy/stream.sh"]

FROM base AS app
USER node
EXPOSE 8686
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8686/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
