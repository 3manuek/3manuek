---
title: "Timeouts en cascada a través del Pool (PGBouncer)"
subtitle: "query_timeout de Pgbouncer y statement_timeout de Postgres"
date: 2024-10-02
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - PGBouncer
  - Pooling
---

## Combinando `query_timeout` y `statement_timeout`

En la [documentación de pgbouncer]() se establece que el `query_timeout` debería configurarse ligeramente 
más alto que el `statement_timeout` de Postgres. Aunque esto aplica en la mayoría de los casos, depende
de los requisitos del negocio.

Generalmente, el `statement_timeout` debería configurarse al percentil 99 de la duración de tus statements.
Sin embargo, hay casos donde ciertos statements requieren timeouts más largos, debido a particularidades como
un conjunto grande de clientes, o campos más grandes, como en casos de compresión TOAST.

La siguiente secuencia describe lo que sucedería si el `query_timeout` se configura a un valor ligeramente 
más alto que el `statement_timeout`:

{{< mermaid >}}
sequenceDiagram
    autonumber
    participant Application
    participant PgBouncer
    participant Postgres

    Application->>+PgBouncer: Connect 
    PgBouncer->>+Postgres: Connect 
    
    Postgres->>PgBouncer: Connection established
    PgBouncer->>-Application: Connection established

    Application->>Application: Custom User statement_timeout    
    Application->>+PgBouncer: Command
    PgBouncer->>Postgres: Forward command
    
    Postgres->>Postgres: Apply statement_timeout<br/>(5 or default)
    Postgres-->>-PgBouncer: statement_timeout

    PgBouncer--X Application: Timeout
    PgBouncer->>PgBouncer: Apply query_timeout


    PgBouncer-->>-Application: query_timeout
    Postgres--X Application: Non-applicable custom statement_timeout

{{< /mermaid >}}


Puedes estar preguntándote sobre esos casos que requieren una configuración de timeout diferente. Un enfoque
probablemente recomendado sería configurar el `query_timeout` a un valor que signifique una especie de
_límite duro_ en términos de tiempo de ejecución. Entonces, lo ideal sería tener este timeout por encima
del `statement_timeout` tan grande como para cubrir consultas de ejecución de casos extremos.

{{< mermaid >}}
sequenceDiagram
    autonumber
    participant Application
    participant PgBouncer
    participant Postgres

    Application->>+PgBouncer: Connect 
    PgBouncer->>+Postgres: Connect 
    
    Postgres->>PgBouncer: Connection established
    PgBouncer->>-Application: Connection established

    Application->>Application: Custom User statement_timeout    
    Application->>+PgBouncer: Command
    PgBouncer->>Postgres: Forward command
    
    alt is default
        Postgres->>Postgres: Apply default statement_timeout

    else is custom
        Postgres->>Postgres: Apply custom statement_timeout
    end
    Postgres-->>-PgBouncer: statement_timeout
    PgBouncer--X Application: Timeout

    PgBouncer->> PgBouncer: Apply query_timeout

    PgBouncer--X- Application: query_timeout

{{< /mermaid >}}

Es decir, en el caso de un `statement_timeout` por defecto de 30 segundos y un `statement_timeout` personalizado
de 60 segundos para la consulta más larga, el `query_timeout` podría configurarse a un poco más de **60 segundos**.

## Conclusion

Usa `query_timeout` como un límite duro para la duración de la consulta, y `statement_timeout` como un límite "suave".

