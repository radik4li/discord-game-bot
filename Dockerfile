FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the bot file
COPY index.js ./

# Run the bot
CMD ["node", "index.js"]
