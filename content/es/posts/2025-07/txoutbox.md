---
title: "Estrategias de Particionamiento de Postgres para el Patrón Transactional Outbox"
subtitle: "Solo otra estrategia de modelado para el patrón outbox"
date: 2025-07-01
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
  - Outbox
  - Microservices
---


## Introducción

El Patrón Transactional Outbox (**TOP** de ahora en adelante) es un enfoque de diseño utilizado para gestionar de manera confiable transacciones distribuidas en arquitecturas basadas en eventos. Aborda el desafío de mantener la consistencia entre una transacción de base de datos y la posterior publicación de eventos o mensajes relacionados. 
Consulta [Microservices Patterns](https://microservices.io/patterns/data/transactional-outbox.html) para una lectura más detallada sobre el patrón. 

Con el TOP, los mensajes se almacenan inicialmente en una tabla outbox como parte de la misma transacción que modifica los datos del negocio. 

Un enfoque común sería [como este post](https://dev.to/msdousti/postgresql-outbox-pattern-revamped-part-1-3lai), que tiene el siguiente diagrama y flujo de secuencia:


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

En el post actual, vamos a personalizar la implementación del modelo hacia una mejor mantenibilidad y rendimiento, usando las últimas características de Postgres.
Hay muchas implementaciones personalizadas para este patrón, y puedes encontrar optimizaciones para tu caso de uso particular. 

## Estado del Evento bajo la estrategia Outbox 

Considera el conductor o despachador separado que lee periódicamente de este outbox, envía los mensajes a su destino y actualiza su estado.
Para la partición `ARCHIVE` podríamos truncar periódicamente (si no necesitamos consultar estos eventos) o exportar a un almacenamiento externo (si esperamos almacenar una cantidad masiva de eventos).

Ahora, consideremos un escenario más personalizado para nuestra lógica de conductor. Nuestro conductor hipotético tiene las siguientes características:

- El conductor almacena Jobs con un Estado, en este caso usaremos `INCOMING`, `PROCESSING`, `DONE`, `ERRORED`, `CANCELED` y `ARCHIVED` para el ejemplo.
- No queremos tener el historial de trabajos disponible dentro de Postgres, y confiaremos en el destino para leer eventos de historial. Pero, solo por localidad de datos, podemos querer almacenar el historial de unos pocos meses. 
- Algunos estados pueden tener una cantidad considerable de actualizaciones antes de cambiar sus estados, por lo que queremos optimizaciones a nivel de almacenamiento para manejar tal carga de trabajo.
p. ej., tanto INCOMING como PROCESSING pueden tener varias actualizaciones sobre el campo `phase` o incluso los campos `error_code` y `error_message`.


Nuestros Estados de Evento están definidos en un tipo ENUM, que es óptimo en términos de almacenamiento y computación de comparación:

```sql
CREATE TYPE state AS ENUM ('INCOMING','PROCESSING', 'DONE', 
                'ERRORED', 'CANCELED', 'ARCHIVED');
```

Este caso es un enfoque para eliminar la necesidad de mantener la tabla outbox hinchada o que requiera gestión y mantenimiento de particiones. Se enfoca en usar Postgres como la parte _transaccional_ del componente conductor.


{{< mermaid >}}
graph LR
    EventConductor -->|Partitions| Incomming[Event Conductor INCOMING]
    EventConductor -->|Partitions| Processing[Event Conductor PROCESSING]
    EventConductor -->|Partitions| Done[Event Conductor DONE]
    EventConductor -->|Partitions| Errored[Event Conductor ERRORED]
    EventConductor -->|Partitions| Canceled[Event Conductor CANCELED]
    EventConductor -->|Partitions| Archived[Event Conductor ARCHIVED]
    Archived -->|Subpartitions| Archived_2020[Archived 2020]
    Archived -->|Subpartitions| Archived_2021[Archived 2021]
    Archived -->|Subpartitions| Archived_N[Archived N]
{{< /mermaid >}}

Si usas una implementación personalizada de Postgres, ¡también podríamos usar Foreign Data Tables para las subparticiones ARCHIVED!

{{< mermaid >}}
graph LR
    EventConductor[Event Conductor] -->|Partitions| Incomming[Event Conductor INCOMING]
    EventConductor -->|Partitions| Processing[Event Conductor PROCESSING]
    EventConductor -->|Partitions| Done[Event Conductor DONE]
    EventConductor -->|Partitions| Errored[Event Conductor ERRORED]
    EventConductor -->|Partitions| Canceled[Event Conductor CANCELED]
    EventConductor -->|Partitions| Archived[Event Conductor ARCHIVED]
    Archived -->|Subpartitions| Archived_2020[FDW Archived 2020]
    Archived -->|Subpartitions| Archived_2021[Archived 2021]
    Archived -->|Subpartitions| Archived_N[Archived N]
    Archived_2020 -->|External Storage| External_Storage[External Storage]
    Archived_2021 -->|External Storage| External_Storage[External Storage]
{{< /mermaid >}}


Truco recursivo:


[1]: https://www.rudderstack.com/blog/scaling-postgres-queue/
[2]: https://github.com/3manuek/txoutbox
[3]: https://aws.amazon.com/blogs/database/archive-and-purge-data-for-amazon-rds-for-postgresql-and-amazon-aurora-with-postgresql-compatibility-using-pg_partman-and-amazon-s3/

