FROM node:20
WORKDIR /app
COPY package*.json tsconfig.json prisma ./
RUN npm install \
 && npx prisma generate
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 4000
CMD ["/bin/bash","/app/entrypoint.sh"]
