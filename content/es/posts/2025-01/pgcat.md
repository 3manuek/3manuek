---
title: "Evaluando el Sharding por hash de PGCat"
subtitle: "Distribuyendo shards a través de nodos."
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
La característica de sharding de PGCat está actualmente en fase experimental. El código del laboratorio se puede encontrar en **[lab_pgcat](https://github.com/3manuek/lab_pgcat).**
{{< /notice >}}


## Mecanismos de sharding de [PGCat](https://github.com/postgresml/pgcat)

A partir de hoy, PGCat soporta 2 mecanismos de sharding a través de sintaxis extendida:

- Estableciendo el shard explícitamente: `SET SHARD TO '<index>';`, lo que te permite hacer _sharding determinístico_, ya sea que elijas 
  tu shard de acuerdo a una regla, como una búsqueda, región, grupo de clientes, etc. 
  Esto es genial si tienes uno de esos bien delimitados o una distribución uniforme. Pero, sigue siendo un buen enfoque y algo escalable.
  No nos enfocaremos en esta estrategia en este post, ya que su implementación depende de requisitos personalizados.
- Estableciendo `sharding_function` para usar una de las funciones disponibles: `pg_bigint_hash` y `sha1`. La sintaxis extendida `SET SHARDING KEY TO '<value>';` calculará el índice. No está muy claro en la documentación cómo se usa la función `sha1`, así que este post se enfocará en el caso de `pg_bigint_hash`. 
  Shard por hash es una estrategia audaz, particularmente si esperas tener una carga de trabajo grande, y necesitas tener suficiente cómputo en todos los shards.
  Esta sintaxis extendida se puede hacer a través de comentarios, consulta la [documentación de Sharding de pgcat](https://github.com/postgresml/pgcat?tab=readme-ov-file#sharding).
  En este laboratorio, nos enfocaremos en la función `pg_bigint_hash`. No está claro en la documentación de PGCat cómo debería implementarse `sha1`, pero extenderé el laboratorio para cubrirlo -- eso es, si supero mis _problemas de habilidad_ :P .

En este punto, puedes estar consciente de las complejidades de implementar sharding, y qué limitaciones esperamos del enfoque de hashing.
Ten en cuenta que esta característica de PGCat está vinculada a la partición de Postgres, basada en la misma [HASH_PARTITION_SEED](https://github.com/postgres/postgres/blob/27b77ecf9f4d5be211900eda54d8155ada50d696/src/include/catalog/partition.h#L20). 
Consulta también [pgcat hash seed](https://github.com/postgresml/pgcat/blob/main/src/sharding.rs#L6).

El resharding es costoso, siempre. Y en este caso, estar vinculado a un esquema de partición de Postgres hace las cosas más difíciles. 
p. ej. necesitarás reconstruir tablas para la nueva distribución hash si necesitas escalar el clúster. 

La estrategia usual cuando haces shard por hash, es comenzar con un módulo grande (es decir, cantidad total de particiones).
Debido a esto, puede que no quieras comenzar con un shard por nodo, ya que puedes terminar con una arquitectura costosa desde el principio.

La estrategia es simple en este laboratorio: asignar más de un shard por nodo. Un gráfico de ejemplo de esto sería el siguiente:


{{< mermaid >}}
flowchart TD
    POOL(fa:fa-database PGCat/shardpool) 
    CLIENT(fa:fa-database Client) -. Port 15432 .-> POOL 
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
        TABLEP3 -.-> PART3(fa:fa-table Modulus 3 Partition)
        end
    end
    subgraph Node2
        subgraph Shard1 fa:fa-database
        TABLEP1 -.-> PART1(fa:fa-table Modulus 1 Partition)
        end
        subgraph Shard4 fa:fa-database
        TABLEP4 -.-> PART4(fa:fa-table Modulus 4 Partition)
        end
    end
    subgraph Node3
        subgraph Shard2 fa:fa-database
        TABLEP2 -.-> PART2(fa:fa-table Modulus 2 Partition)
        end
        subgraph Shard5 fa:fa-database
        TABLEP5 -.-> PART5(fa:fa-table Modulus 5 Partition)
        end
    end
{{< /mermaid >}}


Dentro de este enfoque, puedes comenzar asignando más de un shard por nodo, y migrar esos shards a nuevos nodos 
sin la necesidad de cambiar el módulo, que define la cantidad total de particiones permitidas. 

Cada shard contiene la misma tabla padre, con solo una partición por shard que corresponde con su resto hash. Este es el único giro, y evita inserciones accidentales en la partición incorrecta. También, te permite
operar esas particiones independientemente. 

{{< notice "info" >}}
Nota que podrías fusionar particiones en el mismo shard y dejar que PGCat apunte al mismo nodo/shard, sin embargo el nombrado del shard debería usar una convención diferente. p. ej. `shard_A`, `shard_B`, etc.
{{< /notice >}}


Esto, combinado con Replicación Lógica y la capacidad de PGCat para recargar configuración sobre la marcha, permitirá migrar cada shard independientemente.

## Laboratory

Extendí las [pruebas originales](https://github.com/postgresml/pgcat/tree/main/tests/sharding) para ejecutarse en una 
arquitectura personalizada y usar el scripting de pgbench para hacer benchmarks adicionales.

El laboratorio consiste en contenedores generados vía playbook de Ansible. La razón de no usar Docker Compose aquí, es porque
no tiene suficiente flexibilidad para escalar contenedores que no son stateless. Los playbooks de Ansible nos permiten hacer 
configuración más dinámica sobre la misma familia de contenedores. Puedes encontrar que no hay mucha diferencia entre ellos, 
ya que los atributos mantienen coherencia entre tecnologías.

[![Asciinema](/images/posts/pgcat.gif)](https://asciinema.org/a/707248)


Aquí están las partes clave del laboratorio:


{{< tabs tabTotal="4" >}}

{{% tab tabName="0: Ansible Inventory" %}}

El inventario contiene 2 variables importantes: `shard_factor` y `shard_modulus`, donde `shard_modulus` debería ser
divisible por el `shard_factor`.

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

El playbook de ansible usa el módulo `community.docker.docker_container` para desplegar los contenedores.

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

{{% tab tabName="2: Model" %}}

Cada nodo Postgres contiene una tabla con una sola partición para el resto correspondiente del shard, obteniendo su módulo 
extrayendo el índice del nombre de la base de datos. 

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

{{% tab tabName="3: PGCat configuration" %}}

El `pgcat.toml` se genera a través de la siguiente plantilla jinja:

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

La plantilla renderizada construirá la lista de shards de la siguiente manera:

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

Para iniciar el clúster, ejecuta los siguientes comandos:

```bash
pipenv shell
pipenv install
# If you are on MacOS:
export DOCKER_HOST=$(docker context inspect $(docker context show) | jq -r '.[].Endpoints.docker.Host')

ansible-playbook main.yaml
```

Para limpiar:

```bash
ansible-playbook main.yaml --tags clean
```

Ahora, para ejecutar benchmarks básicos, reutilizaremos las pruebas originales y las portaremos al formato pgbench (ver [pgbench-shard.sql](https://github.com/3manuek/lab_pgcat/blob/main/pgbench-shard.sql)):

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

Cambiar el ID de las filas requiere algo de trabajo adicional, pero PGCat permite esto haciendo (eso migrará la fila a través de particiones remotas -- ¡genial!):

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

{{< notice "info" >}}
El playbook ejecuta un benchmark rápido usando una imagen docker personalizada. Se pretende extender esto para ejecutarse durante un período de tiempo para recopilar métricas.
{{< /notice >}}

La forma en que nos conectamos al pool con sharding es usando su nombre como la base de datos (`shardpool` en este caso). Por ejemplo, podemos ejecutar la prueba localmente emitiendo algo como esto (estoy usando aquí Postgres.app para Mac, usa tus binarios locales):

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/17/bin/
PGPASSWORD=password ${PGBIN}/pgbench -h localhost -p 15432 -U shard_user -d shardpool -f pgbench-shard.sql -c 10 -T 10 
```

## ¿Qué sigue?

- Realizar un benchmark de estrés podría necesitar algunos recursos, y probablemente no es el punto de esta investigación. 
- El punto aquí es combinar tanto la migración lógica como la capacidad de pgcat para gestionar todo el proceso de cambio de endpoints.  
- También, el laboratorio fue una especie de intento experimental en módulos de Ansible para gestionar contenedores docker, debido a que había experimentado limitaciones con compose/stack templating servicios stateful y configuración renderizada. 
  Así que probé Ansible y todas esas limitaciones desaparecieron, no sin algo de trabajo y escritura adicional ya que necesitas reproducir la creación de todos los objetos a través de diferentes tareas (por supuesto). Pero, lo encontré mucho más fácil de gestionar, extender y corregir. Soy capaz de tener, digamos, diferentes stacks usando la misma infraestructura central. 

¡Gracias por leer!

