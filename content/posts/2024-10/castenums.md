---
title: "Casting ENUMS"
subtitle: "Casting from int to enum and vice-versa"
date: 2024-10-02
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
---

## Using ENUMS

Using ENUMs could be a decent strategy for avoiding JOINs to with poor cardinality. That is,
categories or data that has a a narrow range of possible values.

ENUMS are stored as integers, and the description of that value is stored in the `pg_enum` catalog
table.


```sql
CREATE OR REPLACE FUNCTION position_to_enum_typenum(integer)
RETURNS typenum AS $$
  SELECT enumlabel::typenum FROM pg_catalog.pg_enum 
   WHERE enumtypid = 'typenum'::regtype
     and enumsortorder = $1;
$$ LANGUAGE SQL STABLE STRICT;

CREATE OR REPLACE FUNCTION enum_to_position(anyenum) RETURNS integer AS $$
SELECT enumpos::integer FROM (
        SELECT row_number() OVER (order by enumsortorder) AS enumpos,
               enumsortorder,
               enumlabel
        FROM pg_catalog.pg_enum
        WHERE enumtypid = pg_typeof($1)
    ) enum_ordering
    WHERE enumlabel = ($1::text);
$$ LANGUAGE SQL STABLE STRICT;

CREATE CAST (integer AS typenum) WITH FUNCTION position_to_enum_typenum(integer);
CREATE CAST (typenum AS integer) WITH FUNCTION enum_to_position(anyenum);

INSERT INTO dictplus SELECT kid, typ::typenum, title FROM dict;

```