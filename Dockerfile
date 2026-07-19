# Dockerfile for SUB/WAVE Discord Bot
FROM node:18-alpine

# Install system dependencies needed for native voice building if needed
# and runtime ffmpeg (though we bundle ffmpeg-static, system-wide is robust)
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

CMD ["node", "src/index.js"]
