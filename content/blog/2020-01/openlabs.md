---
title: "Open Labs"
subtitle: "Open available Database Laboratories."
excerpt: ""
date: 2020-01-20
author: "3manuek"
draft: false
images:
  - /blog/assets/thumbnail_db.png
series:
  - Getting Started
tags:
  - hugo-site
categories:
  - Projects
# layout options: single or single-sidebar
layout: single

---

## Database Laboratories

During the last years, I've been working on several open labs for Database trainings and webinars for OnGres
and CanalDBA community. Some of these laboratories may look out-of-date, but they should commit their purpose for 
references and examples on how to setup them with few lines of code and with the most popular technologies.

If you are willing to start with Ansible, Terraform, Docker and others for Databases, you may found this resources
interesting for you.


## Benchmark-styled projects

Even tho I would rather use a different approach for benchmarks today (probably CDK or Pulumi), [benchplatform][1] 
have been developed to test Postgres and Mongo under sysbench data modeling. It uses Terraform and Packer for provisioning.

Very old but relevant in terms of results (encryption measurements and performance) is [pgCryptoBench][6], which compares encryption
efficiency through PgCrypto extension.


## Generic POC and 

Another environment created for a benchmark purpose is [POC-Odyssey][2], which has been developed in Terraform. If you are interested
in Postgres Pooling, this might be useful for understanding its setup and general practices.

If you are rather more interested in Modern HA concepts, [HA_POC][5] is a project that I developed for Nerdear.la 2018 and it implements
HA under different engines and databases. Some components are not finished or buggy, but it can also be useful for those starting with
Docker with Databases.

As part of CanalDBA, we also started this [dockerlab][3], which does very basic stuff although it is the most up-to-date.

## Kubernetes and Databases

Even tho the most recommended way to start with Kube is through Operators (I recommend to checkout Stackgres.io), [pocoyoonk8s][4] is 
a practical example on how to spin resources on it. It uses different techniques: with templates and straight task deploy.




---

[1]: https://gitlab.com/ongresinc/benchplatform
[2]: https://gitlab.com/ongresinc/labs/poc-odyssey
[3]: https://gitlab.com/canaldba/labs/dockerlab
[4]: https://gitlab.com/viadb/labs-and-pocs/pocoyoonk8s
[5]: https://gitlab.com/3manuek/HA_PoC
[6]: https://github.com/3manuek/pgCryptoBench
