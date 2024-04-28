---
title: "Pool exhaustion laboratory"
subtitle: "A study between single and multi-threaded Pools"
excerpt: ""
date: 2024-04-19
author: "3manuek"
draft: false

series:
  - Postgres
  - Pooling
  - Terraform
  - Labs
tags:
  - Postgres
  - Pooling
  - Terraform
  - Labs

---


## Context

>
> To see more details about the code used and the results, see the [code here](https://github.com/3manuek/exhausting_pools).
>

This laboratory is a hypothetical scenario, whether application does empty transactions
in order to emulate sort of a DoS attack against the pools. The intention here, was to 
study the behavior of 2 very popuplar Postgres Pools in these cases.

The main difference between both pools relies on how they use CPU resources. PgBouncer
is a single-threaded services, whether Odyssey uses multiple and configurable workers. It is expected certain
overhead on multi-workers in these cases, and that was the moto of this laboratory.

The intention here is not to choose one or another, but to study in which cases one could
use single-threaded or multi-worker pools. 

The data on this laboratory is outdated, as new versions have been released from both tools,
so conclusions may be inaccurate for newer versions. Although, I do not expect much difference
as the architecture of those components haven't changed radically.



## Early Conclusions

> See [Docs](https://github.com/3manuek/exhausting_pools/doc/) with the collected stats.

PgBouncer is more perfomant at single-thread, no surprise. However, the stability of Odyssey
may be relevant. PgBouncer stalls during a certain period, mostly because its mechanism to 
put connections in wait state meanwhile the core is fully allocated. Odyssey can be less
performant, but it didn't stall badly.

Of course, in a production environment, it would be suicidal to go with a single pool, and 
that's where there are better techniques for deploying PgBouncer.

It may probably be more recommedable to go with Odyssey (or other multi-threaded solution) when
spawning pools on dedicted hardware or resources, as it is straightforward to do so. PgBouncer
supports multi-process in the same machine through [so_reuseport](https://www.pgbouncer.org/config.html#so_reuseport)],
but it ties each process to a core, which makes the configuration and core assignment a little
bit more hackish.

However, in automated architectures such as Kubernetes (whether you an assign services programmatically),
PgBouncer might be more convenient, as it is more performant whenever it keeps connections out of
waiting state.

## Missing points

- How to deterministically calculate the maximum client-connection capacity of PgBouncer?
  - That is, considering the rate frequency of the core, register capacity, and hardware multi-threading ( which
    should impact negatively on single-process services).
- The lab lacks of a monitoring, which could shred more information about the behavior observed. That will be in 
  another post with updated versions of all the components (and probably ditch Terraform).
- PgCat seems to be a very appealing solution for pooling to be compared with PgBouncer.