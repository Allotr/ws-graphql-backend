#!/bin/bash
kubectl apply -f ./artifacts/dev/deployment.yaml
kubectl apply -f ./artifacts/dev/service.yaml

kubectl scale --replicas=0 deployment allotr-ws-graphql-backend -n openfaas-fn
kubectl scale --replicas=2 deployment allotr-ws-graphql-backend -n openfaas-fn