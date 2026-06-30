FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.js cdc-consumer.js ./

EXPOSE 5000
ENTRYPOINT ["node"]
CMD ["server.js"]
