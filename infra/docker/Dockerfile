# syntax=docker/dockerfile:1
#
# Ein Dockerfile, drei Targets — FaBu besteht aus drei unabhaengig
# ausgelieferten Teilen, die aus demselben Repo gebaut werden:
#
#   api      Express-Backend (+ Reminder-Worker, gleiches Image)
#   web      React/Vite-SPA, ausgeliefert von nginx
#   landing  statische Astro-Seite, ausgeliefert von nginx
#
# Bauen immer ueber infra/docker-compose.prod.yml, nicht per `docker build`
# von Hand — die Targets und der Build-Kontext (Repo-Root) stehen dort.

# ─── gemeinsame Basis ────────────────────────────────────────────────────────
#
# Alle drei Workspace-Manifeste werden kopiert, obwohl jedes Target nur eines
# davon braucht: `npm ci` validiert den Lockfile gegen *jedes* im Lockfile
# genannte Workspace-Manifest und bricht ab, wenn eines fehlt.
FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json  backend/package.json
COPY frontend/package.json frontend/package.json
COPY landing/package.json  landing/package.json


# ─── api ─────────────────────────────────────────────────────────────────────

FROM base AS api-deps
# better-sqlite3 liefert keine Prebuilds fuer musl, also muss es hier aus dem
# Quellcode gebaut werden. Das Modul wird produktiv nie *benutzt*
# (DB_CLIENT=postgres), aber backend/src/db/client.js importiert es statisch
# auf Modulebene — es muss vorhanden und ladbar sein, sonst startet das
# Backend nicht. Die Toolchain bleibt in dieser Stage und landet nicht im
# Laufzeit-Image.
RUN apk add --no-cache python3 make g++
RUN npm ci --omit=dev --workspace=backend

FROM node:20-alpine AS api
ENV NODE_ENV=production
WORKDIR /repo
# Erst die fertigen node_modules aus der deps-Stage, dann der Quellcode
# darueber. COPY fuehrt Verzeichnisse zusammen und loescht nichts, die
# Abhaengigkeiten bleiben also erhalten.
COPY --from=api-deps /repo ./
COPY backend ./backend
# Das Upload-Verzeichnis wird vom Compose als Named Volume gemountet. Es muss
# hier schon existieren und dem Laufzeit-User gehoeren: Docker uebernimmt beim
# ersten Mounten die Eigentuemerschaft aus dem Image. Fehlt das, gehoert der
# Mountpunkt root und multer kann keine Fahrzeugbilder schreiben.
RUN mkdir -p /repo/backend/data/uploads/vehicles \
  && chown -R node:node /repo/backend/data
USER node
WORKDIR /repo/backend
EXPOSE 3001
# Das X-Forwarded-Proto ist nicht schmueckend: mit NODE_ENV=production leitet
# backend/src/app.js jede Anfrage ohne diesen Header auf https um (301), und
# der Healthcheck wuerde der Umleitung nach https://127.0.0.1 folgen und
# scheitern — der Container waere dauerhaft "unhealthy", obwohl er laeuft.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null --header="X-Forwarded-Proto: https" \
      http://127.0.0.1:3001/api/version || exit 1
CMD ["node", "src/index.js"]


# ─── web (React-SPA) ─────────────────────────────────────────────────────────

FROM base AS web-build
# Bewusst *mit* devDependencies: vite und @vitejs/plugin-react sind
# devDependencies und ohne sie gibt es keinen Build. Auf dem alten VPS war
# genau das eine Dauerbaustelle (siehe die npm-Config-Verrenkungen in
# deploy-prod.sh) — im Container ist die Umgebung sauber.
RUN npm ci --workspace=frontend
COPY frontend ./frontend
RUN npm run build --workspace=frontend

FROM nginx:alpine AS web
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/frontend/dist /usr/share/nginx/html


# ─── landing (Astro) ─────────────────────────────────────────────────────────

FROM base AS landing-build
RUN npm ci --workspace=landing
COPY landing ./landing
RUN npm run build --workspace=landing

FROM nginx:alpine AS landing
COPY infra/docker/nginx-landing.conf /etc/nginx/conf.d/default.conf
COPY --from=landing-build /repo/landing/dist /usr/share/nginx/html
