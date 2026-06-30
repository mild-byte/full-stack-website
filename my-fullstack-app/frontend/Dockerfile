FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY public ./public
COPY src ./src

ENV HOST=0.0.0.0
ENV PORT=3000
ENV BROWSER=none

EXPOSE 3000
ENTRYPOINT ["npm", "start"]
