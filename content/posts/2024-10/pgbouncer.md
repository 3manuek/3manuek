---
title: "Cascading timeouts through Pool (PGBouncer)"
subtitle: "Pgbouncer query_timeout and Postgres statement_timeout"
date: 2024-10-02
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - PGBouncer
  - Pooling
---

## Combining `query_timeout` and `statement_timeout`

In [pgbouncer's documentation]() it's stated that the `query_timeout` should be set slightly 
higher that Postgres' `statement_timeout`. Although this apply in most of the cases, it depends
on the business requirements.

Generally, the `statement_timeout` should be set to the 99th percentile of your statements duration.
However, there are cases were certain statements require larger timeouts, due to particularities like
a large customer set, or larger fields, as in TOAST compression cases.

The following sequence describes what would happen if the `query_timeout` is set to a value slightly 
higher than the `statement_timeout`:

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


You may wondering about those cases that require a different timeout setting. A probably
recommended apporach would be to set the `query_timeout` to a value that means sort of a
_hard limit_ in terms of execution time. So, the ideal would be to have this timeout above
the `statement_timeout` as larger to cover corner-case execution queries.

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

That is, in the case of a `statement_timeout` by default of 30 seconds and a custom `statement_timeout`
of 60 seconds for the longest query, the `query_timeout` could be set to a little bit more of **60 seconds**.

## Conclusion

Use `query_timeout` as a hard limit for query duration, and `statement_timeout` as a "soft" limit. 