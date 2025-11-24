---
title: "Postgres Releases Timeline and Major Features chart"
subtitle: "Just a handy chart for Postgres releases and major features."
excerpt: ""
date: 2025-06-30
author: "3manuek"
draft: false

series: "Postgres"
tags:
  - Postgres
# layout options: single or single-sidebar
layout: single
---

{{< notice "info" >}}
More information, see [the versioning page](https://www.postgresql.org/support/versioning/).
Why upgrade? More detailed feature diff at [Depesz](https://why-upgrade.depesz.com/).

{{< /notice >}}



{{< mermaid >}}
timeline
    title PostgreSQL Releases (1990–1999)

        1995 : Postgres95
             : SQL support introduced
             : Client/server architecture
             : Initial performance tuning
        1996 : PostgreSQL 6.0
             : Renamed PostgreSQL
             : MVCC introduced
             : Major codebase rework
        1997 : PostgreSQL 6.1
        1998 : PostgreSQL 6.3, 6.4
        1999 : PostgreSQL 6.5
             : WAL logging
             : Foreign keys
             : Improved SQL compliance
{{< /mermaid >}}

{{< mermaid >}}
timeline
    title PostgreSQL Releases (2000–2003)
        2000 : PostgreSQL 7.0
             : TOAST storage
             : Improved join performance
             : Foreign key refinements
        2001 : PostgreSQL 7.1
             : WAL refined
             : Outer joins
             : Enhanced PL/pgSQL
        2002 : PostgreSQL 7.2, 7.3
        2003 : PostgreSQL 7.4
             : Auto-vacuum introduced
             : Statement-level triggers
             : Index optimizations
{{< /mermaid >}}

{{< mermaid >}}
timeline
    title PostgreSQL Releases (2005–2009)
        2005 : PostgreSQL 8.0, 8.1
             : Native Windows support
             : Tablespaces
             : Savepoints
        2006 : PostgreSQL 8.2
             : GIN indexes
             : Planner improvements
             : Warm standby via WAL
        2008 : PostgreSQL 8.3
             : HOT (Heap Only Tuples)
             : XML datatype
             : UUID datatype
        2009 : PostgreSQL 8.4
             : Window functions
             : Recursive queries
             : Parallel restore


{{< /mermaid >}}


{{< mermaid >}}
timeline
    title PostgreSQL Releases (2010–2016)

        2010 : PostgreSQL 9.0
             : Streaming replication
             : Hot standby
             : Column-level triggers
        2011 : PostgreSQL 9.1
             : Synchronous replication
             : Unlogged tables
             : Foreign tables
        2012 : PostgreSQL 9.2
             : JSON datatype
             : Index-only scans
             : Range types
        2013 : PostgreSQL 9.3
             : JSON improvements
             : Materialized views
             : Writable foreign tables
        2014 : PostgreSQL 9.4
             : JSONB datatype
             : Logical decoding
             : ALTER SYSTEM command
        2016 : PostgreSQL 9.5
             : UPSERT support
             : Row-level security
             : BRIN indexes
        2016 : PostgreSQL 9.6
             : Parallel queries
             : Phrase full-text search
             : Replication improvements
{{< /mermaid >}}

{{< mermaid >}}
timeline
    title PostgreSQL Releases (2017–2019)
        2017 : PostgreSQL 10
             : Declarative partitioning
             : Logical replication
             : Improved parallelism
        2018 : PostgreSQL 11
             : JIT compilation
             : Stored procedures
             : Partitioning enhancements
        2019 : PostgreSQL 12
             : Partitioning refinements
             : Generated columns
             : REINDEX CONCURRENTLY

{{< /mermaid >}}

{{< mermaid >}}
timeline
    title PostgreSQL Releases (2020–Present)
        2020 : PostgreSQL 13
             : B-tree improvements
             : Parallel vacuum
             : Incremental sorting
        2021 : PostgreSQL 14
             : JSONB subscripting
             : Logical replication streaming
             : Performance enhancements
        2022 : PostgreSQL 15
             : MERGE statement
             : Enhanced logical replication
             : Index/sort improvements
        2023 : PostgreSQL 16
             : Logical replication from standby
             : CPU scalability
             : Enhanced monitoring
        2024 : PostgreSQL 17
             : Vacuum memory reduced 20x
             : JSON_TABLE support
             : Incremental backups
             : Synchronous Logical Slots
{{< /mermaid >}}