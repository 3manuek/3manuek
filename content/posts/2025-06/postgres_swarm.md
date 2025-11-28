---
title: "Postgres/Patroni in Docker Swarm"
subtitle: "Do not ask why."
date: 2025-05-30
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
  - Docker
  - Swarm
  - Patroni
---


{{< notice "info">}}

{{< /notice >}}

## Terminology 

In the case you're not familiar with the Docker terminology, here it is a brief description:

- [Stack](https://docs.docker.com/engine/swarm/stack-deploy/): A collection of services that make up an application in a swarm.
- [Service](https://docs.docker.com/engine/swarm/how-swarm-mode-works/services/): An application that runs on a swarm.
- [Container](https://docs.docker.com/engine/swarm/how-swarm-mode-works/services/#images-and-containers): A process that runs on a node in a swarm.
- [Swarm](https://docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/): A cluster of Docker Engines that are joined together to run services.

## Architecture

The following are the required ports to be enabled for cluster communication:

| Port  | Protocol | Description                                                                                 |
|-------|----------|---------------------------------------------------------------------------------------------|
| 2376  | TCP      | Secure Docker client communication. Required for Docker Machine to orchestrate Docker hosts.|
| 2377  | TCP      | Communication between the nodes of a Docker Swarm or cluster. Open on manager nodes only.   |
| 7946  | TCP/UDP  | Communication among nodes for container network discovery.                                  |
| 4789  | UDP      | Overlay network traffic for container ingress networking.                                   |
| 22    | TCP      | SSH into instances remotely.                                                                |
| 5432  | TCP      | Postgres database communication.                                                            |
| 8008  | TCP      | Patroni REST API communication.                                                             |


{{< mermaid >}}
flowchart TD
  subgraph Node1 Manager
    E1[etcd1]
    P1[postgres1]
    HA1[haproxy]
  end

  subgraph Node2 Worker
    E2[etcd2]
    P2[postgres2]
    HA2[haproxy]
  end

  subgraph Node3 Worker
    E3[etcd3]
    P3[postgres3]
    HA3[haproxy]
  end

  subgraph Overlay Network
    BN[overlay_network]
  end

  %% Connect each service to the overlay network
  E1 --- BN
  P1 --- BN
  HA1 --- BN

  E2 --- BN
  P2 --- BN
  HA2 --- BN

  E3 --- BN
  P3 --- BN
  HA3 --- BN
{{< /mermaid >}}
