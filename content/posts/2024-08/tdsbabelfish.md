---
title: "Pooling TDS connections in Babelfish with FreeTDS"
subtitle: "TDSPool utility"
date: 2024-08-15
author: "3manuek"
draft: true
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
  - MSSQL
---

## BabelfishPG connection architecture

Inherited from the postgres architecture, each connection trhough the TDS port will 
instance a Postgres backend. As in Postgres, BabelfishPG needs a middleware for funnel
connections through the TDS port.

For Postgres, we have plenty of options, like PGBouncer, Odyssey, pgcat, name it. 
For T-SQL (read as MSSQL compatible language), there aren't many open sourced solutions.

One of the options we explore here, is from the freetds project.


## Pooling with TDSPool (FreeTDS)


[`tdspool`](https://www.freetds.org/userguide/tdspool.html) is part of the `freetds-bin` package.
It relies in 2 configuration files, [freetds.conf](https://www.freetds.org/userguide/freetdsconf.html) and [tdspool.conf](https://www.freetds.org/userguide/tdspool.html).

Two _very_ important limitations:

-  The FreeTDS connection pool currently does not supports TDS version 5.0 (Sybase) and encrypted connections. This restriction applies to both the client-to-pool and pool-to-server connections!
- It does not allow to tweak a cap on frontend connections.

{{< tabs tabTotal="2" >}}

{{% tab tabName="freetds.conf" %}}
```ini
[global]
        tds version = auto 
        dump file = /var/log/tdspool.log 
[babelfish]
        host = localhost
        port = 1433
        database = master
```
```
    For tds version, Babelfish uses 7.4 if desired to specify the version.
```
{{% /tab %}}

{{% tab tabName="tdspool.conf" %}}

```ini
[global]
min pool conn = 5
max pool conn = 30
max member age = 120

[clientpool]
server user = babelfish_admin 
server password = themainuserpassword
server = babelfish
user = appuser
database = appdb
password = apppassoword
max pool conn = 30
port = 5000
```
{{% /tab %}}

{{< /tabs >}}



When you start `tdspool`, you need to specify on top of which pool it will serve. The database context
will change if authorization succeeds.

<!-- https://somethingstrange.com/posts/hugo-with-fontawesome/ to integrate fontawesome fa-solid fa-database -->
{{< mermaid >}}
flowchart TD
    A[App] -->|Port 5000| B(TDSPool)
    A -->|Port 5001| F(TDSPool)
    A -->|Port 5002| G(TDSPool)
    B -.->|Port 1433| D(Database)
    F -.->|Port 1433| D
    G -.->|Port 1433| D
{{< /mermaid >}}

`tdspool`


## Behavior

