---
title: "Postgres en Docker Swarm"
subtitle: "No preguntes por qué."
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

En el caso de que no estés familiarizado con la terminología de Docker, aquí hay una breve descripción:

- [Stack](https://docs.docker.com/engine/swarm/stack-deploy/): Una colección de servicios que forman una aplicación en un swarm.
- [Service](https://docs.docker.com/engine/swarm/how-swarm-mode-works/services/): Una aplicación que se ejecuta en un swarm.
- [Container](https://docs.docker.com/engine/swarm/how-swarm-mode-works/services/#images-and-containers): Un proceso que se ejecuta en un nodo en un swarm.
- [Swarm](https://docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/): Un clúster de Docker Engines que se unen para ejecutar servicios.



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

