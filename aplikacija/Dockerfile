# Aplikacija (Node.js 24 LTS + Express + EJS). Gradi se iz korena repozitorija (glej docker-compose.yml),
# ker potrebuje tudi skupni css/style.css in js/email.js.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Najprej samo package*.json: odvisnosti se ponovno namestijo le, ko se spremenijo.
COPY aplikacija/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

COPY aplikacija/ ./
COPY css/style.css ./public/css/style.css
COPY js/email.js ./public/js/email.js
COPY js/email.js ./skupno/email.js

# Naložene datoteke so v volumnu izven javne mape (/data/datoteke), aplikacija ne teče kot root.
RUN mkdir -p /data/datoteke && chown -R node:node /data/datoteke
USER node

EXPOSE 3000
CMD ["node", "app.js"]
