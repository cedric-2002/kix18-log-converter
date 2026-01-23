# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .


RUN mkdir -p /app/saved

ENV PORT=2000
EXPOSE 2000

CMD ["npm", "start"]
