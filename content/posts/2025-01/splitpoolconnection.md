---
title: "Splitting connection pooling"
subtitle: "A better practice for handling connection pooling"
date: 2024-10-02
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
---


NOTES
Is a good practice to split connection poolers by application with different connection logic. Some of the benefits:

- Manage pooling independently, with a custom server-side connection persistency, and settings.
- Isolate potential issues between applications. Applications with a longer persistent connection will steal capacity in the pool unless you assign different pool size per user, which leds to have a separated provisioning only for the pool.
- Not all poolers are single-threaded, however the most popular pool (pgbouncer) does this. It has certain advantages, particularly in the cloud-native philosophy and K8s environments. Having this in mind, your connection capacity will be tied to a single core unit, which can lead to potential saturation of this resource.
- For multi-worker pool connection services such as pgcat, keep in mind that there is a considerable overhead when using complex configurations -- QUANTIFY