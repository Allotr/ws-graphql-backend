#!/bin/bash
kubectl apply -f ./artifacts/deployment.yaml
kubectl apply -f ./artifacts/service.yaml

kubectl scale --replicas=0 deployment allotr-ws-graphql-backend -n openfaas-fn
kubectl scale --replicas=2 deployment allotr-ws-graphql-backend -n openfaas-fn