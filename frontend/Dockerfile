# stage 1: build
FROM node:20-alpine AS build

WORKDIR /app

# Pin the major so image builds stay reproducible. lockfileVersion 9.0.
RUN npm install -g pnpm@10

# Manifests first: this layer caches across source-only changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Vite inlines VITE_* at build time, and .dockerignore keeps .env out of the
# build context, so anything the app reads has to arrive as a build arg.
# Every consumer of these falls back to a default when the value is empty, so
# an unpassed arg degrades to that default rather than breaking the bundle.
ARG VITE_API_URL
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_PAYSTACK_PUBLIC_KEY

ENV VITE_API_URL=$VITE_API_URL \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET \
    VITE_PAYSTACK_PUBLIC_KEY=$VITE_PAYSTACK_PUBLIC_KEY

# VITE_META_PIXEL_ID / VITE_META_PIXEL_HOSTS are deliberately absent. They are
# optional overrides with defaults in src/utils/metaPixel.ts, and an empty
# string there means "disable tracking" — declaring unset args here would set
# them to "" and silently switch the pixel off. Add them only to override.

RUN pnpm run build

# stage 2: nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
