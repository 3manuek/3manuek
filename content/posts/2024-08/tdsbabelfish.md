---
title: "Pooling TDS connections in BabelfishPG with FreeTDS"
subtitle: "TDSPool utility"
date: 2024-08-15
author: "3manuek"
draft: false
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
  - MSSQL
  - Pooling
---

> Next post will cover performance tests using `tdspool`.

## BabelfishPG connection architecture

Inherited from Postgres connection architecture, each connection trhough the TDS port will 
instance a Postgres backend. As in Postgres, BabelfishPG needs a middleware for funnel
connections through the TDS port for avoiding running out of connections and processing capacity
in the database server.

For Postgres, we have plenty of options, like PGBouncer, Odyssey, pgcat, name it. 
For T-SQL (read as MSSQL compatible language), there aren't many open sourced solutions.

One of the options we explore here, is from the FreeTDS project: [`tdspool`](https://www.freetds.org/userguide/tdspool.html),
part of the `freetds-bin` package.

>
> Two _very_ important limitations before you consider this in productive environment when using `tdspool`:
> 
> - The FreeTDS connection pool currently does not supports TDS version 5.0 (Sybase) and encrypted connections. This restriction applies to both the client-to-pool and pool-to-server connections!
> - It does not allow to tweak a cap on frontend connections.
>

If you're new around the BabelfishPG project and you stumbled here for whatever reason, 
keep in mind that there are two types of [database architectures](https://babelfishpg.org/docs/installation/single-multiple/#single-vs-multiple-instances) set at 
[`babelfish_tsql.migration_mode`](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlmigration_mode): `single-db` and `multi-db`.

Generally, most of the cases you may want to choose in between. Here is my personal take:

- If your databases are small and you need to access all of them, maybe `multi-db` is a good choice.
  However, if this applies to a development environent, but in production you expect each of those databases
  to be in separated resources keep in mind that the user mapping in the Postgres instance will be different.
- You want to have large databases each one on dedicated resources, `single-db`. If this is the case, and you
  want to have a development environment, you may want to stick to this mode instead of using `multi-db` for consolodating.



## Pooling with TDSPool (FreeTDS)

For this example, we are going to configure the following pool architecture:

<!-- https://somethingstrange.com/posts/hugo-with-fontawesome/ to integrate fontawesome fa-solid fa-database -->
{{< mermaid >}}
flowchart TD
    A[App] -->|Port 5000| B(fa:fa-filter appdbpool)
    A -->|Port 5001| F(fa:fa-filter appreportpool)
    B -.->|Port 1433 <br/> 5-30 server-side conns| D(fa:fa-database <br/> BabelfishPG)
    F -.->|Port 1433 <br/> 5-30 server-side conns| D
{{< /mermaid >}}


`tdspool` relies in 2 configuration files, [.freetds.conf](https://www.freetds.org/userguide/freetdsconf.html) and [.pool.conf](https://www.freetds.org/userguide/tdspool.html). By default, it expects those files to be in the user's home directory.

{{< tabs tabTotal="2" >}}

{{% tab tabName=".freetds.conf" %}}
```ini
[global]
        tds version = auto 
        dump file = /var/log/tdspool.log 
[babelfish]
        host = localhost
        port = 1433
        database = master
```

>   Babelfish uses 7.4 if desired to specify the version.

{{% /tab %}}

{{% tab tabName=".pool.conf" %}}

```ini
[global]
min pool conn = 5
max pool conn = 30
max member age = 120

[appdbpool]
server user = babelfish_admin 
server password = themainuserpassword
server = babelfish
user = appuser
database = appdb
password = apppassoword
max pool conn = 30
port = 5000

[appreportpool]
server user = babelfish_admin 
server password = themainuserpassword
server = babelfish
user = appreport
database = appdbreport
password = apppassoword
max pool conn = 30
port = 5001

```
{{% /tab %}}

{{< /tabs >}}





Aside the authorization and credentials configuration, the most important settings are:

- `min pool size`: is the number of minimum amount of connections to the server to keep open, so less latency for those
  queries executed after a period of inactivity.
- `max pool size`: this value is tied to the CPU capacity and the `max_connections` setting at Postgres level.
- `max member age`: used to garbage collect connections.

When you start `tdspool`, you need to specify on top of which pool it will serve. The database context
will change if authorization succeeds, as the server is connected to `master` in this example case. In production,
you may want to isolate the access by having different server configurations with their own users and databases.


Starting the services:

```bash
tdspool -c .pool.conf appdbpool
tdspool -c .pool.conf appreportpool
```


The above configuration will configure two pools to serve `appdb` and `appreport` databases, with different users.
This is, for exampling a case where there are different workloads between both application parts (main application and 
asynchronous reporting queries). 

For connecting using `tsql`, which is our available client in the FreeTDS toolset, we need to specify the
server with the `-S` option:

```bash
tsql -S babelfish -p 5000 -P ${APPDB_PASS} -D appdb -U appuser
```

Thanks for reading, keep tuned for the next post!