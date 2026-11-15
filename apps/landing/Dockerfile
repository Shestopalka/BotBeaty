# Сайт-лендинг BeatyBOTI: статичний index.html + мінімальний сервер без залежностей.
FROM node:20-alpine
WORKDIR /app
COPY index.html serve.js ./
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "serve.js"]
