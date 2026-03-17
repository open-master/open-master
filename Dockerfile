FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
