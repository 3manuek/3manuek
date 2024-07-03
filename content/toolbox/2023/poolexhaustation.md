---
title: "Postgres' Pool exhaustion laboratory"
subtitle: "A study between single (PgBouncer) and multi-threaded (Odyssey) pools"
excerpt: ""
date: 2023-04-19
author: "3manuek"
draft: false

series: "Postgres"
tags:
  - Labs
  - Terraform
  - Ansible
  - Postgres
  - Pooling
  - PGBouncer
  - Odyssey
layout: single
---

## Description


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

One of the tests, focused on "single per-worker" benchmark performance. Of course, in a production environment, 
it would be a terrible design from HA perspective to have a single worker. The idea was to
isolate the worker performance, as in Kubernetes, services can be allocated easily with a CPU Quota across a multl-node
cluster orchestration[^1]. So, creating a pool layer with load balancing is trivial. 

In bare-metal setups, that don't use such orchestration, you need to rely on a scalable pool service layer both horizontally 
(more computes) and vertically (more Cores). In these cases, is more efficient to rely on services
that are stable and can scale vertically automatically. 


> NOTE: The data on this laboratory is outdated, as new versions have been released from both tools,
so conclusions may be inaccurate for newer versions. Although, I do not expect much difference
as the architecture of those components haven't changed radically. The solely purpose of this page,
is to document the architecture of the benchmark.

## Context 

This laboratory a continuation of the PGIbz 2019's talk about [Pooling Performance](https://github.com/3manuek/slides/blob/master/2019/pgibz/Pooling%20Performance.pdf),
 and was inspired in the work we have done at [Gitlab](https://gitlab.com/) with the [OnGres](https://www.ongres.com/) teams.

We want to repeat the laboratory and publish the results at [OnGres](https://www.ongres.com/) in the future. This
is just a portfolio of the benchmark architecture. 


## Architecture of the benchmark

The architecture was spawn in 4 different machines: Client (to isolate noise in services), the Odyssey compute,
the PGBouncer compute and the Postgres compute.

{{< mermaid >}}
graph TB
    odysseyp["Odyssey"] -. Pool Size=32 .-> Postgres
    pgbouncer["PgBouncer"] -. Pool Size=32 .-> Postgres
    pgbench["PgBench"] -. unlimited clients .-> odysseyp
    pgbench["PgBench"] -. max_client_conn=100k .-> pgbouncer

    subgraph CLI["Client Compute"]
        pgbench["PgBench"]
        pgbench_N["PgBench...N"]
    end
    subgraph PGB["Pgbouncer Compute"]
        pgbouncer["PgBouncer"]
    end
    subgraph ODY["Odyssey Compute"]
        odysseyp["Odyssey Parent"] -.- odysseysys
        odysseyp["Odyssey Parent"] -. workers=N .- odysseyworkerN
        odysseysys["Odyssey System"]
        odysseyworkerN["Odyssey Workers"]
    end
    subgraph PG["Postgres Compute"]
        Postgres
        Postgres --- disk("pd-ssd")
    end
{{< /mermaid >}}



## Technology Stack

The technology stack is compoused as:

- AWS EC2 Instances.
- Terraform as the Deployment tool.
- Ansible as the Provisioning and Configuration tool.
- Cloud Init. ☠︎ 
- Bash. Don't blame, this was a PoC, nothing fancy. 

## Very Early Conclusions

> See [Docs](https://github.com/3manuek/exhausting_pools/doc/) with the collected stats.


PgBouncer is more perfomant at single-thread, no surprise. However, the stability of Odyssey
may be relevant to consider. PgBouncer stalls during a certain period, mostly because its mechanism to 
put connections in _wait state_ meanwhile the core capacity is fully allocated. Odyssey can be less
performant, but it didn't stall badly. That makes it more stable for vertical scalability on the nodes,
but less relevant on orchestrated environments, where you expect CPU efficiency.


It may probably be more recommedable to go with Odyssey (or other multi-threaded solution) when
spawning pools on dedicted hardware or resources, as it is straightforward to do so. PgBouncer
supports multi-process in the same machine through [so_reuseport](https://www.pgbouncer.org/config.html#so_reuseport),
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



[^1]: > Orchestration's CPU cycles _are like Taxes_. As the _Louis XIV's Finance Minister_, _Jean-Baptiste Colbert_,
 declared: "the art of taxation consists in so plucking the goose as to obtain the largest possible 
 amount of feathers with the smallest possible amount of hissing.".