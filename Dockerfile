FROM node:22-bookworm-slim

# Chromium + màn hình ảo + âm thanh + ffmpeg cho chế độ phát 24/7, font tiếng Việt/emoji
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb pulseaudio pulseaudio-utils ffmpeg curl ca-certificates \
      fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN useradd -m -u 1001 chua && mkdir -p data && chown -R chua:chua /app
USER chua

ENV HOST=0.0.0.0 PORT=8686 CHROME_BIN=/usr/bin/chromium
EXPOSE 8686
CMD ["node", "server/index.js"]
