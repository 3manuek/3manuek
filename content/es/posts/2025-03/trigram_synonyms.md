---
title: "Sinónimos y errores ortográficos para plataformas DBaaS"
subtitle: "Superando el acceso limitado al Sistema de Archivos"
date: 2025-03-10
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
  - RDS
---

<!-- See shortcodes/pev2.html, not working. head.tml, see PEV2 -->
<!-- {{< pev2 plan="Seq Scan on foo  (cost=0.00..155.00 rows=10000 width=4)" >}} -->

{{< notice "info">}}
Si tienes una configuración vanilla o acceso al Sistema de Archivos en tu configuración de Postgres, ¡solo usa sinónimos de Thesaurus! 
{{< /notice >}}

Más que un post, este es un ejemplo rápido sobre cómo implementar sinónimos en Postgres, particularmente cuando no tienes acceso al Sistema de Archivos para configurar un Thesaurus.

El concepto es simple, crearemos una tabla que contiene los sinónimos y haremos una búsqueda de proximidad sobre su descripción. 

Sin embargo, hacer búsqueda de texto hoy en día podría involucrar el procesamiento de una cantidad de datos que supera la capacidad del nodo, particularmente memoria. Entonces, primero, hagamos una implementación simple de sinónimos, y luego, nos moveremos hacia una implementación más rica en características. 

La primera iteración es bastante simple. Una tabla para entradas, una para sinónimos. Luego, hacemos una búsqueda de proximidad con los índices apropiados usando operadores Trigram.

> Lectura adicional: [Búsqueda Semántica en Postgres del post de Cybertec](https://www.cybertec-postgresql.com/en/semantic-search-in-postgresql-an-overview/).


{{< tabs tabTotal="3" >}}

{{% tab tabName="1: Entries table" %}}


```sql
\c template1
DROP DATABASE IF EXISTS searcher;
CREATE DATABASE searcher;
\c searcher
CREATE EXTENSION citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;


CREATE TYPE categories AS ENUM ('things', 'people', 'business', 'places');


CREATE TABLE entries (
    entryid bigint PRIMARY KEY,
    cat categories,
    title text,
    relevance int default 0 -- for bosting certain entries
);

CREATE TABLE dictsynonyms (
    term citext,
    synonym citext
);

-- Here is the index that will be used with the ilike operator
CREATE INDEX ON dictplus USING GIN (title gin_trgm_ops);
CREATE INDEX ON dictsynonyms USING GIN (term gin_trgm_ops);
```

{{% /tab %}}

{{% tab tabName="2: Load entries" %}}

```csv
entryid,cat,title,relevance
1,things,"Tesla, Nvidia, Palantir Bounce Amid Market Volatility",10
2,people,"Police Chief Accused of Covering Up Alleged Gang Rape Involving High-Profile Individuals",5
3,business,"Dow Jones Futures Whipsaw on Latest Tariff News",8
4,places,"Kyiv's Commitment to Ceasefire Pressures Putin Amid Ongoing Conflict",3
5,things,"Chiefs Graded 'B-' for Free Agency Efforts",7
6,people,"Giants Sign Jevon Holland and Chauncey Golston to Bolster Defense",6
7,business,"Stock Market Reacts to Increased Tariffs on Canadian Metals",4
8,places,"Maui Police Chief Allegedly Involved in Cover-Up of High-Profile Crime",9
9,things,"Tech Stocks Rebound Despite Recent Declines",2
10,people,"NFL Stars Involved in Legal Controversies Amid Off-Season",1
```

Using `psql` we can execute `\copy` for uploading the testing entries:

```sql
COPY dict FROM 'entries.csv' WITH ( FORMAT CSV, HEADER true);
\copy entries(entryid, cat, title, relevance) FROM 'entries.csv'  DELIMITER ',' CSV HEADER;
```

{{% /tab %}}

{{% tab tabName="3: Query" %}}

```sql
INSERT INTO dictsynonyms (term, synonym) VALUES
('BMW', 'Bayerische Motoren Werke'),
('The Donald', 'Donald Trump'),
('Bill','Will');


SELECT *
FROM entries d
WHERE ( d.title ilike '%' || (SELECT synonym 
                                  FROM dictsynonyms 
                                  WHERE term ilike '%bill%') || '%'
        OR d.title ilike '%bill%')
        and d.cat = 'people'
LIMIT 10;
```

{{% /tab %}}

{{< /tabs >}}




