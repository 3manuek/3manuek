---
title: "Casteo de ENUMs"
subtitle: "Casteo de int a enum y viceversa"
date: 2024-10-02
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
---

## Usando ENUMs

Usar ENUMs podría ser una estrategia decente para evitar JOINs con baja cardinalidad. Es decir,
categorías o datos que tienen un rango estrecho de valores posibles.

Los ENUMs se almacenan como enteros, y la descripción de ese valor se almacena en la tabla de catálogo `pg_enum`.


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

