---
title: "Evaluating PGCat's Sharding by hash"
subtitle: "Distributing shards across nodes."
date: 2025-03-09
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - Pooling
  - PGCat 
  - Sharding
---

{{< notice "info" >}}
PGCat's sharding feature is currently experimental. The code for the laboratory can be found at **[lab_pgcat](https://github.com/3manuek/lab_pgcat).**
{{< /notice >}}


## [PGCat](https://github.com/postgresml/pgcat) sharding mechanisms

As of today, PGCat supports 2 mechanisms of sharding through extended syntax:

- By setting the shard explicitly: `SET SHARD TO '<index>';`, which allows you to do _deterministic sharding_, whether you choose 
  your shard according to a rule, such a lookup, region, customer's group, etc. 
  This is great if you have one of those well delimited or an even distribution. But, still a nice approach and kind scalable.
  We won't be focusing on this strategy in this post, as its implementation relies on custom requirements.
- Setting `sharding_function` to use one of the available functions: `pg_bigint_hash` and `sha1`. The extended syntax `SET SHARDING KEY TO '<value>';` will calculate the index. Not very clear from docs how `sha1` function is used, so this post will focus on `pg_bigint_hash` case. 
  Shard by hash is a bold strategy, particularly if you expect to have a large workload, and you need to have enough compute across all shards.
  This extended syntax can be done through comments, see [pgcat Sharding documentation](https://github.com/postgresml/pgcat?tab=readme-ov-file#sharding).
  In this laboratory, we'll focus on the `pg_bigint_hash` function. It is not clear from PGCat's documentation how `sha1` should be implemented, by I'll extend the laboratory to cover it -- that is, if I overcome my _skill issues_ :P .

At this point, you may be aware of the complexities of implementing sharding, and what limitations we expect from the hashing approach.
Keep in mind that this PGCat feature is tied to the Postgres partition, based on the same [HASH_PARTITION_SEED](https://github.com/postgres/postgres/blob/27b77ecf9f4d5be211900eda54d8155ada50d696/src/include/catalog/partition.h#L20). 
See also [pgcat hash seed](https://github.com/postgresml/pgcat/blob/main/src/sharding.rs#L6).

Resharding is costly, always. And in this case, being tied to a Postgres partition schema makes things harder. 
eg. you'll need to rebuild tables for the new hash distribution if you need to scale up the cluster. 

The usual strategy when you do shard by hash, is to start with a large modulus (that is, total amount of partitions).
Due this, you may not want to start with a shard per node, as you can end up with a costly architecture from the beginning.

The strategy is simple in this laboratory: allocate more than one shard per node. An example graph of this would be as follow:


{{< mermaid >}}
flowchart TD
    CLIENT(fa:fa-database Client) --> POOL(fa:fa-database PGCat)    
    POOL -->|Remainder 0| TABLEP0(fa:fa-table Parent Table)
    POOL -->|Remainder 1| TABLEP1(fa:fa-table Parent Table)
    POOL -->|Remainder 2| TABLEP2(fa:fa-table Parent Table)
    POOL -->|Remainder 3| TABLEP3(fa:fa-table Parent Table)
    POOL -->|Remainder 4| TABLEP4(fa:fa-table Parent Table)
    POOL -->|Remainder 5| TABLEP5(fa:fa-table Parent Table)
    subgraph Node1
        subgraph Shard0 fa:fa-database
        TABLEP0 -.-> PART0(fa:fa-table Modulus 0 Partition)
        end
        subgraph Shard3 fa:fa-database
        TABLEP3 -.-> PART3(fa:fa-table Modulus 0 Partition)
        end
    end
    subgraph Node2
        subgraph Shard1 fa:fa-database
        TABLEP1 -.-> PART1(fa:fa-table Modulus 1 Partition)
        end
        subgraph Shard4 fa:fa-database
        TABLEP4 -.-> PART4(fa:fa-table Modulus 0 Partition)
        end
    end
    subgraph Node3
        subgraph Shard2 fa:fa-database
        TABLEP2 -.-> PART2(fa:fa-table Modulus 2 Partition)
        end
        subgraph Shard5 fa:fa-database
        TABLEP5 -.-> PART5(fa:fa-table Modulus 0 Partition)
        end
    end
{{< /mermaid >}}


Within this approach, you can start allocating more than one shard per node, and migrate those shards to new nodes 
without the need of changing the modulus, which defines the total amount of allowed partitions. 

Each shard holds the same parent table, with only one partition per shard which corresponds with its hash 
reminder. 

This, combined with Logical Replication and the ability of PGCat for reloading configuration on the fly, will 
allow to migrate each shard independently.

## Laboratory

I extended the [Original tests](https://github.com/postgresml/pgcat/tree/main/tests/sharding) for running on a 
custom architecture and use pgbench's scripting for doing further benchmarks.

The laboratory consists in containers spawn via Ansible playbook. The reason of not using Docker Compose here, is because
it does not have enough flexibility to scale containers that aren't stateless. Ansible playbooks allow us to make 
more dynamic configuration over the same container family. You may find that there is not much difference in between, 
as the attributes maintain coherence across technologies.

![Asciinema](/images/posts/pgcat.gif)


Here are the key parts of the laboratory:


{{< tabs tabTotal="4" >}}

{{% tab tabName="0: Ansible Inventory" %}}

The inventory contains 2 important variables: `shard_factor` and `shard_modulus`, where `shard_modulus` should be
equal to `shard_factor * shard_factor`.

```yaml
all:
  vars:
    postgres_user: "node_user"
    postgres_password: "password"
    postgres_db: "postgres"
    shard_prefix: "shard_"
    shard_factor: 3                     # How many shards per node by default
    shard_modulus: 9                    # How many total shards
    pgcat_expose_port_ix: 15432
```  

{{% /tab %}}

{{% tab tabName="1: main.yaml" %}}

The ansible playbook uses `community.docker.docker_container` module for deploying the containers.

```yaml
    # Deploy PostgreSQL Node
    - name: Run PostgreSQL Node Container
      community.docker.docker_container:
        name: "{{ item.stdout }}"
        image: postgres:17
        restart_policy: unless-stopped
        env:
          POSTGRES_USER: "{{ postgres_user }}"
          POSTGRES_PASSWORD: "{{ postgres_password }}"
          POSTGRES_DB: "{{ postgres_db }}"
        ports:
          - "16000-16100:5432"
        networks:
          - name: back-net
        labels:
          com.docker.scaled.kind: node
        volumes:
          - ".conf/init_{{ item.stdout }}.sql:/docker-entrypoint-initdb.d/init.sql"
        command: >
          postgres  -c wal_level=logical
                    -c max_replication_slots=4
                    -c max_wal_senders=4
                    -c listen_addresses='*'
                    -c hot_standby_feedback=on
                    -c sync_replication_slots=true
      loop: "{{ nodes.results }}"

    # Deploy PgCat (Connection Pooler)
    - name: Run PgCat Container
      community.docker.docker_container:
        name: pgcat
        image: ghcr.io/postgresml/pgcat:latest
        restart_policy: unless-stopped
        ports:
          - "15432:5432"
        volumes:
          - ".conf/pgcat.toml:/etc/pgcat/pgcat.toml"
        labels:
          com.docker.scaled.kind: pgcat
        networks:
          - name: back-net
```

{{% /tab %}}

{{% tab tabName="2: Container Scripts" %}}

Each Postgres node contains a table with a single partition for the corresponding shard's remainder, getting its modulus 
by extracting the index from the database name. 

```jinja
{% for shard in range(nodeix | int, shard_modulus, shard_factor) %}
CREATE DATABASE {{ shard_prefix }}{{ shard }};
{% endfor %}

{% for shard in range(nodeix | int, shard_modulus, shard_factor) %}

\c {{ shard_prefix }}{{ shard }}

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    username BIGINT PRIMARY KEY, 
    email TEXT NOT NULL
) PARTITION BY HASH (username);

CREATE TABLE users_{{ shard }}_v1 PARTITION OF users FOR VALUES WITH (MODULUS {{ shard_modulus }}, REMAINDER {{ shard }});

{% endfor %}

```

{{% /tab %}}

{{% tab tabName="3: pgcat.toml" %}}

The pgcat.toml is genrated through the following template:

```jinja
[pools.shardpool.users.0]
username = "{{ postgres_user }}"
password = "{{ postgres_password }}"
pool_size = 10
pool_mode = "transaction"

{% for i in nodes.results %}
{% for shard in range(i.item, shard_modulus, shard_factor) %}
[pools.shardpool.shards.{{ shard }}]
servers = [["{{ i.stdout }}", 5432, "primary"]]
database = "{{ shard_prefix }}{{ shard }}"
{% endfor %}
{% endfor %}
```

The rendered template will build the shard list as follows:

```toml
[pools.shardpool.users.0]
username = "node_user"
password = "password"
pool_size = 10
pool_mode = "transaction"

[pools.shardpool.shards.0]
servers = [["node_0", 5432, "primary"]]
database = "shard_0"
[pools.shardpool.shards.3]
servers = [["node_0", 5432, "primary"]]
database = "shard_3"
[pools.shardpool.shards.6]
servers = [["node_0", 5432, "primary"]]
database = "shard_6"
[pools.shardpool.shards.1]
servers = [["node_1", 5432, "primary"]]
database = "shard_1"
[pools.shardpool.shards.4]
servers = [["node_1", 5432, "primary"]]
database = "shard_4"
[pools.shardpool.shards.7]
servers = [["node_1", 5432, "primary"]]
database = "shard_7"
[pools.shardpool.shards.2]
servers = [["node_2", 5432, "primary"]]
database = "shard_2"
[pools.shardpool.shards.5]
servers = [["node_2", 5432, "primary"]]
database = "shard_5"
[pools.shardpool.shards.8]
servers = [["node_2", 5432, "primary"]]
database = "shard_8"
```

{{% /tab %}}

{{< /tabs >}}

--- 

To initiate the cluster, run the following commands:

```bash
pipenv shell
pipenv install
# If you are on MacOS:
export DOCKER_HOST=$(docker context inspect $(docker context show) | jq -r '.[].Endpoints.docker.Host')

ansible-playbook main.yaml

# For cleaning up
ansible-playbook main.yaml --tags clean
```


A basic pgbench benchmark would like this:

```sql
\set key random(1, 10000 * :scale)

-- Write: Insert a new user
SET SHARDING KEY TO ':key';

BEGIN;
INSERT INTO users (username, email) VALUES (
    :key,
    :key || '@example.com'
) ON CONFLICT (username) DO NOTHING;

SELECT * FROM users WHERE email = :key || '@example.com';
END;
```

Chaging the ID of rows requires some additional work, but PGCat allows this by doing:

```sql
\set newkey random(1, 10000 * :scale)

SET SHARDING KEY TO ':key';
BEGIN;
DELETE FROM users WHERE username = :key;
END;

SET SHARDING KEY TO ':newkey';
BEGIN;
INSERT INTO users VALUES (:newkey, ':key' || '@changed.com')
ON CONFLICT (username) DO NOTHING;
END;
```

The way we connect to the sharded pool is by using its name as the database (`shardpool` in this case). For instance, we can execute the test
by issuing something like this (I'm using here Postgres.app for Mac, use your local binaries):

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/17/bin/
PGPASSWORD=password ${PGBIN}/pgbench -h localhost -p 15432 -U shard_user -d shardpool -f pgbench-shard.sql -c 10 -T 10 
```

In the next posts, I'll run stress benchmarks with different shard modulus and doing shard migrations combining Logical Replication 
and PGCat hot-reloading.

Thanks for reading!