---
title: "Dirty REST for Postgres Role Information"
subtitle: "Example of creating a Background Worker in Postgres"
excerpt: ""
date: 2023-05-09
author: "3manuek"
draft: false

series: "Postgres"
tags:
  - Labs
  - Postgres
  - Extensions
layout: single
---


> Source Code: [bgw_role_rest](https://gitlab.com/ongresinc/extensions/bgw_role_rest)

This experimental extension was developed as a training material for building Postgres
extensions that spawn background workers. 

The reason of the REST response, is for integrating with Load Balancers that support
REST endpoints for getting the node status. Within this, it was possible to point the
LB to the correct node once promoted, by pointing to the exposed endpoint by the Postgres 
node.

This mimics the Patroni API endpoint for the `leader` status in a rustic manner. There 
was no intention to make this extensions for a production stage, the solely purpose was 
to have an example beyond a `"Hello, world!"`.