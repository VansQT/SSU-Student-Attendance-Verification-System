# Build the React client and the bundled Express server.
FROM node:22-bookworm-slim AS web-build
WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# The recognition worker runs inside this container and is never exposed as a
# public HTTP service. This keeps face captures on the application network.
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHON_EXECUTABLE=/usr/bin/python3 \
    DATA_DIR=/var/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      cmake \
      libjpeg62-turbo-dev \
      liblapack-dev \
      libopenblas-dev \
      python3 \
      python3-dev \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=web-build /app/server.mjs ./server.mjs
COPY --from=web-build /app/dist ./dist
COPY --from=web-build /app/attendance_system_face_recognition_api-master ./attendance_system_face_recognition_api-master

RUN python3 -m pip install --no-cache-dir --break-system-packages \
      -r attendance_system_face_recognition_api-master/requirements.txt \
    && mkdir -p /var/data

EXPOSE 3000
CMD ["npm", "start"]
