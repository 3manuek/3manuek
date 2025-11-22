---
title: "Postgres on Docker laboratories"
subtitle: "HA, CDC and other laboratories for Postgres"
date: 2025-11-01
author: "3manuek"
draft: false
series: "Postgres"
tags:
    - Postgres
    - Labs
    - Docker
---

## Description

{{< notice "info" >}}
[Laboratories Repository](https://github.com/3manuek/labs/tree/main)
{{< /notice >}}

This repository contains several laboratories around Postgres implementations for lecture and training purposes.

Some of them are focused on High Availability, others are focused on Change Data Capture (CDC), but not limited to.

- [Patroni HA with callbacks](https://github.com/3manuek/labs/tree/main/patroni)
  - Doing failovers with callbacks against PgBouncer, for managing connection.
  - Callbacks are used for Pausing, updating databases, and resuming connections.
- [Logical Replication through different Postgres Versions](https://github.com/3manuek/labs/tree/main/logical_replication)
  - This laboratory shows how to use Logical Replication with slight changes in the DDL.
  - The approach can be used for Major Upgrades, eg.
  - The pgbench implementation allows to test the failover and monitor connection states.
- [Sharding with PGCat](https://github.com/3manuek/labs/tree/main/pgcat_hash_sharding)
  - Implementation of a Hash-Sharding based using PgCat. Potentially reusable with PgDog.
- [Patroni on Swarm](https://github.com/3manuek/labs/tree/main/swarm)
  - Implementing a Patroni cluster over Docker Swarm.
  - Several solutions are present in this laboratory. Currently WIP.

Other laboratories contain Transactional Outbox strategies, Debezium and Airflow integrations, which would be used in future posts.  

