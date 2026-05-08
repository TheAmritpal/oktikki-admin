#!/bin/bash

# Build and Push Script for Docker Hub
# This script builds the Docker image and pushes it to Docker Hub

set -e  # Exit on any error

# Load .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Configuration
IMAGE_NAME="oktikkiofficial2026/admin"
TAG="latest"
FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

# Docker Hub credentials (from .env or environment)
DOCKER_USERNAME="${DOCKER_USERNAME:-}"
DOCKER_PASSWORD="${DOCKER_PASSWORD:-}"

echo "🚀 Starting Docker build and push process..."
echo "Image: ${FULL_IMAGE_NAME}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Login to Docker Hub
echo "🔐 Logging in to Docker Hub..."
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t "${FULL_IMAGE_NAME}" .

# Push the image to Docker Hub
echo "📤 Pushing image to Docker Hub..."
docker push "${FULL_IMAGE_NAME}"

echo "✅ Image pushed successfully!"
echo "📦 Image: ${FULL_IMAGE_NAME}"

# Logout from Docker Hub
echo "🔓 Logging out from Docker Hub..."
docker logout

echo "✨ Build and push process completed successfully!"