#!/bin/bash
docker build -t allotr-ws-graphql-backend .
docker tag allotr-ws-graphql-backend rafaelpernil/allotr-ws-graphql-backend:production
docker push rafaelpernil/allotr-ws-graphql-backend:production

kubectl apply -f ./artifacts/deployment.yaml
kubectl apply -f ./artifacts/service.yaml

kubectl scale --replicas=0 deployment allotr-ws-graphql-backend -n openfaas-fn
kubectl scale --replicas=2 deployment allotr-ws-graphql-backend -n openfaas-fn