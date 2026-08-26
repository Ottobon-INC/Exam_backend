FROM node:22-alpine
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (production only for smaller image)
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Expose the port the app runs on
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
