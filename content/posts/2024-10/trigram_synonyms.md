---
title: "Synonyms using trigram"
subtitle: "Overcoming limitations of DBaaS for synonyms"
date: 2024-10-02
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
---


| ⚠️ | If you have a vanilla or access to Filesystem in your Postgres setup, just use Thesaurus synonyms!  |
|---|:---|


## Synonyms

```sql
\c template1
DROP DATABASE IF EXISTS searcher;
CREATE DATABASE searcher;
\c searcher

CREATE TYPE categories AS ENUM ('restaurants', 'people', 'companies');


CREATE TABLE entries (
    kid bigint PRIMARY KEY,
    typ categories,
    title text,
    relevance int default 0 -- for bosting certain entries
);



COPY dict FROM 'entries.csv' WITH ( FORMAT CSV, HEADER true);


CREATE EXTENSION citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE dictsynonyms (
    term citext,
    synonym citext
);

CREATE INDEX ON dictplus USING GIN (title gin_trgm_ops);
CREATE INDEX ON dictsynonyms USING GIN (term gin_trgm_ops);

INSERT INTO dictsynonyms (term, synonym) VALUES
('BMW', 'Bayerische Motoren Werke'),
('The Donald', 'Donald Trump'),
('Bill','Will');


SELECT *
FROM entries d
WHERE ( d.title ilike '%' || (SELECT synonym FROM dictsynonyms WHERE term ilike '%bill%') || '%'
        OR d.title ilike '%bill%')
        and d.typ = 'people'
LIMIT 10;
```

## Misspellings