---
title: "Ansible and Kubernetes"
subtitle: "Deploying in Kubernetes with Ansible."
excerpt: ""
date: 2019-07-18
author: "3manuek"
draft: false
images:
  - /blog/assets/colorful-storage-containers-logistic-center.jpg
series:
  - Getting Started
tags:
  - hugo-site
categories:
  - Ansible
  - Kubernetes
  - Projects
# layout options: single or single-sidebar
layout: single

---

## Install minikube or similar


[](https://github.com/kubernetes/minikube/releases)

```
curl -Lo minikube https://storage.googleapis.com/minikube/releases/v1.2.0/minikube-darwin-amd64 &&\
 chmod +x 
minikube && sudo cp minikube /usr/local/bin/ && rm minikube
```


## Getting the token

[Access Kubernetes API](https://kubernetes.io/docs/tasks/administer-cluster/access-cluster-api/)


## Ansible k8s 


[](https://docs.ansible.com/ansible/latest/modules/k8s_module.html#k8s-raw-module)

`K8S_AUTH_API_KEY` in environment.

## Getting facts with k8s_fact

[](https://docs.ansible.com/ansible/latest/modules/k8s_facts_module.html#k8s-facts-module)