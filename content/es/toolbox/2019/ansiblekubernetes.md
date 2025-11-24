---
title: "Deploying Postgres in Kubernetes with Ansible"
subtitle: "A PoC for basic Kubernetes API calls."
excerpt: ""
date: 2019-07-18
author: "3manuek"
draft: false
images:
  - /images/posts/colorful-storage-containers-logistic-center.jpg
series: "Labs"
tags:
  - Ansible
  - Kubernetes
  - Projects
  - Postgres
  - Labs
layout: single
---

## Laboratory

Even tho Kubernetes allows to deploy production-grade databases, it is possible to
deploy a straightforward Postgres instance without operators or major architecture
designs. Of course, this won't be suitable for a production setup, but is good enough
for understanding the concepts behind k8s API calls.

> See the source: [Postgres deployment on k8s using Ansible](https://github.com/3manuek/pocoyoonk8s)


## Install minikube or similar

[Minikube](https://github.com/kubernetes/minikube/releases)

```bash
curl -Lo minikube \
  https://storage.googleapis.com/minikube/releases/v1.2.0/minikube-darwin-amd64\
  && chmod +x 
minikube && sudo cp minikube /usr/local/bin/ && rm minikube
```


## Getting the token

[Access Kubernetes API](https://kubernetes.io/docs/tasks/administer-cluster/access-cluster-api/)


## Ansible k8s 

[Ansible k8s module](https://docs.ansible.com/ansible/latest/modules/k8s_module.html#k8s-raw-module)

`K8S_AUTH_API_KEY` in environment.

## Getting facts with k8s_fact

[k8s_fact](https://docs.ansible.com/ansible/latest/modules/k8s_facts_module.html#k8s-facts-module)