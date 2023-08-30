#!/bin/bash
docker tag allotr-ws-graphql-backend rafaelpernil/allotr-ws-graphql-backend
docker buildx build --push --platform linux/arm/v7,linux/arm64,linux/amd64  --tag rafaelpernil/allotr-ws-graphql-backend .

