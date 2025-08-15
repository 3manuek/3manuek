---
title: "Postgres State Partitioning for Dispatcher/Conductor in Transactional Outbox Pattern"
subtitle: "Just another modeling strategy for outbox pattern"
date: 2025-07-01
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
  - Outbox
  - Microservices
---


## Introduction

The Transactional Outbox Pattern (**TOP** from now on) is a design approach used to reliably manage distributed transactions in event-driven architectures. It addresses the challenge of maintaining consistency between a database transaction and the subsequent publishing of related events or messages. 
See [Microservices Patterns](https://microservices.io/patterns/data/transactional-outbox.html) for a more detailed reading about the pattern. 

With the TOP, messages are initially stored in an outbox table as part of the same transaction that modifies business data. 

A common approach would be [like this post](https://dev.to/msdousti/postgresql-outbox-pattern-revamped-part-1-3lai), which has the following diagram and sequence flow:


{{< mermaid >}}
graph LR
    OrderService[Order Service] -->|INSERT, UPDATE, DELETE| OrderTable[ORDER table]
    OrderService -->|INSERT| OutboxTable[OUTBOX table]

    subgraph Database
        subgraph Transaction
            OrderTable
            OutboxTable
        end
    end

    OutboxTable -->|Read OUTBOX table| MessageRelay[Message Relay]
    MessageRelay -->|Publish| MessageBroker[Message Broker]

{{< /mermaid >}}


{{< mermaid >}}
sequenceDiagram
    title Transactional Outbox Sequence Flow
    participant App as Application
    participant DB as Database
    participant Outbox as Outbox Table
    participant Dispatcher as Outbox Dispatcher
    participant Ext as External System

    App->>DB: Begin Transaction
    App->>DB: Modify Business Data
    App->>Outbox: Insert Outbox Event
    App->>DB: Commit Transaction
    loop Dispatcher interval
        Dispatcher->>Outbox: Fetch Pending Events
        Outbox-->>Dispatcher: Pending Events
        Dispatcher->>Ext: Send Events
        Ext-->>Dispatcher: Acknowledgement
        Dispatcher->>Outbox: Mark Events as Sent
    end
{{< /mermaid >}}

In the current post, we're going to customize the model implementation towards better maintanability and performance, using the latest Postgres features.
There are many custom implementations for this pattern, and you may found optimizations for your particular use case. 

## Event State under Outbox strategy 

Consider the separated conductor or dispatcher that periodically reads from this outbox, sends the messages to their destination, and updates their state.
For the `ARCHIVE` partition we could either truncate periodically (if we don't need to query these events), or exporting into an external storage (if we
expect to store a massive amount of events).

Now, let's consider a more custom scenario for our  conductor logic. Our hypothetical conductor has the following characteristics:

- The conductor stores Jobs with a State, in this case we'll use `INCOMING`, `PROCESSING`, `DONE`, `ERRORED`, `CANCELED` and `ARCHIVED` for the sake of the example.
- We want to not have the job history available inside Postgres, and we'll rely on destination for reading history events. But, just for data locality, we may want to store the history of about a few months. 
- Some states can have a considerable amount of updates before changing their states, so we want storage level optimizations for handling such workload.
eg., both INCOMING and PROCESSING can have several updates over the `phase` or even the `error_code` and `error_message` fields.


Our Event States are defined in an ENUM type, which is optimal in terms of storage and comparison computing:

```sql
CREATE TYPE state AS ENUM ('INCOMING','PROCESSING', 'DONE', 
                'ERRORED', 'CANCELED', 'ARCHIVED');
```

This case is an approach to remove the need of keeping the outbox table bloated or that requires partition management and maintenance. It focusses on using Postgres as the _transactional_ part of the conductor component.


{{< mermaid >}}
graph LR
    EventConductor[Event Conductor] -->|Partitions| Incomming[Event Conductor INCOMING]
    EventConductor -->|Partitions| Processing[Event Conductor PROCESSING]
    EventConductor -->|Partitions| Done[Event Conductor DONE]
    EventConductor -->|Partitions| Errored[Event Conductor ERRORED]
    EventConductor -->|Partitions| Canceled[Event Conductor CANCELED]
    EventConductor -->|Partitions| Archived[Event Conductor ARCHIVED]
    Archived -->|Subpartitions| Archived_2020[Archived 2020]
    Archived -->|Subpartitions| Archived_2021[Archived 2021]
    Archived -->|Subpartitions| Archived_N[Archived N]
{{< /mermaid >}}

If using a custom Postgres implementation, we could also use Foreign Data Tables for the ARCHIVED subpartitions!

{{< mermaid >}}
graph LR
    EventConductor[Event Conductor] -->|Partitions| Incomming[Event Conductor INCOMING]
    EventConductor -->|Partitions| Processing[Event Conductor PROCESSING]
    EventConductor -->|Partitions| Done[Event Conductor DONE]
    EventConductor -->|Partitions| Errored[Event Conductor ERRORED]
    EventConductor -->|Partitions| Canceled[Event Conductor CANCELED]
    EventConductor -->|Partitions| Archived[Event Conductor ARCHIVED]
    Archived -->|Subpartitions| Archived_2020[FDW Archived 2020]
    Archived -->|Subpartitions| Archived_2021[FDW Archived 2021]
    Archived -->|Subpartitions| Archived_N[Archived N]
    Archived_2020 -->|External Storage| External_Storage[External Storage]
    Archived_2021 -->|External Storage| External_Storage[External Storage]
{{< /mermaid >}}


Recursive trick:


[1]: https://www.rudderstack.com/blog/scaling-postgres-queue/

