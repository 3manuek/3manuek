---
title: "Synonyms and misspellings for DBaaS platforms"
subtitle: "Overcoming limited access to Filesystem"
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
If you have a vanilla or access to Filesystem in your Postgres setup, just use Thesaurus synonyms! 
{{< /notice >}}

More than a post, this is a quick example on how to implement synonyms in Postgres, particularly when you don't
have access to the Filesystem for configuring a Thesaurus.

The concept is simple, we'll create a table that contains the synonyms and do a proximity search over their 
description. 

However, doing text search nowadays could involve the processing of an amount of data that surpasses the node capacity,
particularly memory. So, first, let's do a simple synonym implementation, and then, we'll move towards to a more feature-rich
implemetation. 

The first iteration is quite simple. One table for entries, one for synonyms. Then, we do a proximity search with the proper
indexes using Trigram operators.

> Additional read: [Semantic Search in Postgres from Cybertec post](https://www.cybertec-postgresql.com/en/semantic-search-in-postgresql-an-overview/).


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



