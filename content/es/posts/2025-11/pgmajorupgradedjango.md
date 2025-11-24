---
title: "Actualización Mayor de Postgres y Modelo Django con Replicación Lógica"
subtitle: "La Replicación Lógica puede ser más flexible de lo que parece"
date: 2025-11-15
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - Python
  - Django
---

# La historia

Un cliente necesitaba actualizar su Aurora RDS Postgres de v13 a v16 debido al **EOL de v13**. Este es un requisito común y, hasta ahora, un proceso directo. 
La complejidad surgió cuando necesitaron actualizar su modelo de aplicación, lo cual estaba tomando mucho tiempo debido a que la mayoría de las tablas requerían una reescritura completa.

La migración de Django estaba tomando varias horas en ejecutarse, lo que hacía inviable una actualización blue/green y la posterior ejecución de la migración debido al largo tiempo de inactividad que causaría.

Así que decidimos probar un enfoque más sofisticado: 

1. Crear un esquema vacío con la migración ya aplicada en un v16
2. Agregar las columnas deprecadas en el clúster de destino (para evitar que la Replicación Lógica se queje)
3. Configurar la Replicación Lógica
4. Corregir la deriva del esquema eliminando las columnas agregadas después del cambio. 

De esta manera, el cambio sería casi sin interrupciones.


{{< notice "info">}}
El procedimiento de rollback consistió en crear un pub/sub desde el destino al origen. Ten en cuenta que la suscripción puede carecer de algunos de los parámetros, ya que es una versión anterior. v13 no soporta: `streaming`, `run_as_owner`, y `disable_on_error`.
{{< /notice >}}

La intención de este artículo es demostrar que la Replicación Lógica no es tan estricta como puede parecer, considerando que:

- Los tipos de datos en el suscriptor no son idénticos, pero comparten las mismas primitivas o pueden ser convertidos implícitamente. La mayoría de las tablas estaban moviéndose de `int` a `bigint` y algunas de `text` a `varchar`.
- Las migraciones de Django son estrictas, por lo que podemos evitar esta restricción restaurando la tabla `django_migrations` para evitar elegir la ruta de migración. Esto se hace porque el clúster _origen_ no tenía las últimas migraciones realizadas en la versión v16.
- Si faltan columnas en el destino, esto no sería un problema si usas v15, ya que puedes expandir columnas para cada una de las tablas publicadas. Sin embargo, en este caso, v13 carece de esta característica, por lo que necesitamos usar `ADD COLUMN` y `DROP COLUMN`.
- Se agregaron y renombraron nuevas restricciones en la nueva versión del modelo. Estas no impactan en la Replicación Lógica.


# El proceso

## 1) Esquema y datos de la tabla `django_migrations`

Volcamos el _nuevo esquema_ a un archivo. Este esquema contenía la migración de Django aplicada. También volcamos el contenido de la tabla `django_migrations`, ya que algunas migraciones se ejecutaron en la nueva instancia de prueba v16.

```bash
pg_dump -c -s --no-owner \
  --no-acl $PGURL_DESTINATION > sql/schema.sql
```

```bash
pg_dump $PGURL_DESTINATION \
  --table=django_migrations \
  --data-only \
  --no-owner \
  --no-privileges \
  -f ./sql/django_migrations_data.sql
```

## 2) Restaurar el esquema en el nuevo clúster

Creamos el clúster usando un grupo de parámetros personalizado deshabilitando el `autovacuum`. Una vez que el nuevo clúster está activo, restauramos los archivos que contenían el esquema, la nueva columna y los datos de `django_migrations`:

```bash
psql -f ./sql/schema.sql $PGURL_DESTINATION
psql -f ./sql/000_add_column.sql $PGURL_DESTINATION
psql -f ./sql/django_migrations_data.sql $PGURL_DESTINATION
```


## 3) Publicación personalizada en el clúster origen

Como usamos PostGIS (`spatial_ref_sys` se actualiza con metadatos y no es compatible con la Replicación Lógica), necesitamos expandir las tablas en la definición de la publicación, por lo que `FOR ALL TABLES` no era una opción. En la extensión RDS, los metadatos de PostGIS están bajo la propiedad `rdsadmin`, por lo que solo transmitimos tablas propiedad del usuario actual.


```sql
WITH reptables AS (
    SELECT schemaname ||'.'|| tablename AS tablefqdn
    FROM pg_tables
    WHERE tableowner = '<owner_user>'
        -- Exclude django_migrations table
        AND tablename NOT LIKE 'django_migrations'
    ORDER BY tablefqdn
),
agg AS (
    SELECT string_agg(tablefqdn, ', ') as tables FROM reptables
)
SELECT 'CREATE PUBLICATION migration_v16_expanded_pub FOR TABLE ' || 
  (SELECT tables  FROM agg ) || ';' as cmd;
```

El comando anterior genera el comando necesario para crear la publicación expandida.

## 4) Crear y habilitar suscripción en el clúster destino

El siguiente comando crea la suscripción en el clúster destino. 

```sql
CREATE SUBSCRIPTION subs_migration_v16
  CONNECTION '${PGURL_ORIGIN}?sslmode=require'
  PUBLICATION migration_v16_expanded_pub
  WITH (copy_data = true, 
        create_slot = true, 
        slot_name = subs_slot_migration_v16, 
        enabled = false,
        disable_on_error = true, 
        run_as_owner = true,  
        streaming = 'on'
        );
```

Puedes notar que aún no habilitamos la suscripción. Hacemos esto para poder habilitarla después:

```sql
ALTER SUBSCRIPTION subs_migration_v16 ENABLE;
```

Una vez que la suscripción fue habilitada, el streaming comenzó.


## 5) Monitorear la sincronización inicial y el lag de replicación

El clúster consistía en medio terabyte de datos, por lo que tomó algunas horas hacer la sincronización inicial.

Podemos verificar el estado de la sincronización inicial ejecutando la consulta:

```sql
SELECT srsubstate as code,
CASE srsubstate
    WHEN 'i' THEN 'initializing'
    WHEN 'd' THEN 'data copying'
    WHEN 'f' THEN 'finished data copy'
    WHEN 's' THEN 'synchronized'
    WHEN 'r' THEN 'ready'
    ELSE 'unknown'
END AS state
, count(*) as count_states
, CASE srsubstate WHEN 'd' 
     THEN string_agg(srrelid::regclass::text,',') 
     END as copying_tables
FROM pg_subscription_rel
WHERE srsubid = (SELECT oid 
                    FROM pg_subscription 
                    WHERE subname = 'subs_migration_v16')
GROUP BY srsubstate;
```

Sabremos cuándo la sincronización inicial está completa una vez que todas las tablas estén en estado _ready_ (`r`).

Las siguientes consultas permiten rastrear el lag sobre el streaming del slot:

{{< tabs tabTotal="2" >}}

{{% tab tabName="Origin Lag" %}}
```sql
SELECT 
    slot_name, active, active_pid, 
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(),
    confirmed_flush_lsn)) AS diff_size, 
    pg_wal_lsn_diff(pg_current_wal_lsn(), 
    confirmed_flush_lsn) AS diff_bytes,
    confirmed_flush_lsn as LSN_origin,
    aurora_volume_logical_start_lsn()
FROM pg_replication_slots WHERE slot_type = 'logical';
```

{{% /tab %}}

{{% tab tabName="Destination Lag" %}}
```sql
SELECT subname, 
    received_lsn as LSN_destination, 
    last_msg_receipt_time, 
    latest_end_lsn, 
    latest_end_time, 
    pg_wal_lsn_diff(received_lsn, latest_end_lsn) AS bytes_pending_apply,
    pg_size_pretty(pg_wal_lsn_diff(received_lsn, latest_end_lsn)) AS pending_apply,
    clock_timestamp() - latest_end_time AS lag, 
    clock_timestamp() as current_time, 
    aurora_volume_logical_start_lsn()
FROM pg_stat_subscription;
```
{{% /tab %}}

{{< /tabs >}}

Una vez que el clúster destino se haya puesto al día, estamos listos para proceder con el cambio.


## 6) Preparación para el cambio

{{< notice "info">}}
En Postgres v18, las estadísticas se restauran, por lo que no es necesario ejecutar _analyze_ en el destino.
{{< /notice >}}

Ejecutamos _vacuum analyze_ antes de proceder con el cambio. En la mayoría de los casos, un _analyze_ simple sería suficiente. Sin embargo, en nuestro caso, algunas tablas tienen muchas escrituras, por lo que ejecutamos:

```sql
VACUUM ANALYZE;
```

Después de que el vacuum termine, reiniciamos el clúster destino para volver a habilitar `autovacuum`.

## 7) Cambio y sincronización de secuencias

Desafortunadamente, en este caso el cliente carece de una flota de pgbouncer, por lo que las escrituras necesitaban detenerse en la aplicación. Sin embargo, como también estábamos haciendo una actualización de la aplicación, no había otra opción que desplegar la nueva versión de la aplicación de todos modos.

Durante la fase en la que las escrituras se detuvieron, necesitamos sincronizar las secuencias. 

{{< notice "info">}}
v18 no requiere este paso, ya que las secuencias se transmiten en la Replicación Lógica.
{{< /notice >}}

Las siguientes consultas hacen lo mismo. Las ejecutamos en el clúster origen y su salida se ejecutó en el destino:


{{< tabs tabTotal="2" >}}

{{% tab tabName="With ALTER" %}}
```sql
SELECT 'ALTER SEQUENCE IF EXISTS ' || sequencename || ' RESTART '
 || pg_sequence_last_value(sequencename::regclass) + 1 || ';'
  FROM pg_sequences where last_value IS NOT NULL; 
```

{{% /tab %}}

{{% tab tabName="With setval" %}}
```sql
SELECT
    'SELECT setval(' || quote_literal(quote_ident(n.nspname) 
    || '.' || quote_ident(c.relname)) || ', ' || s.last_value + 1 || ');'
FROM
    pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_sequences s ON s.schemaname = n.nspname
        AND s.sequencename = c.relname
WHERE
    c.relkind = 'S'
    AND s.last_value IS NOT NULL
    AND c.relname NOT LIKE 'awsdms_ddl_%';
```
{{% /tab %}}

{{< /tabs >}}

Después de este paso:

- Desplegamos la aplicación apuntando al clúster destino.
- Creamos la publicación en el destino.
- Creamos la suscripción de rollback en el origen. Como se mencionó, v13 carece de algunos de los parámetros que usamos en la suscripción principal:
  ```sql
  CREATE SUBSCRIPTION rollback_subs_migration_v16
    CONNECTION '${PGURL_DESTINATION}?sslmode=require'
      PUBLICATION rollback_migration_v16_expanded_pub
    WITH (copy_data = true, 
          create_slot = true, 
          slot_name = subs_slot_migration_v16, 
          enabled = false 
    );
   ```

## 8) Limpieza de suscripción LR, slot y publicación

En el destino, procedimos con la eliminación de la suscripción:

```sql
DROP SUBSCRIPTION subs_migration_v16;
```

En el origen, eliminamos la publicación:

```sql
DROP PUBLICATION migration_v16_expanded_pub;
```

Todavía teníamos la suscripción de rollback. Una vez que pasó el período de tolerancia, procedimos con el pub/sub de rollback y eliminamos la columna adicional agregada:

```sql
BEGIN;
    CREATE TABLE IF NOT EXISTS public.__backup__<table> AS
    SELECT id, <column>
    FROM public.<table>;

    ALTER TABLE public.<table>
      DROP COLUMN <column>;
COMMIT;
```

Lo anterior solo hace una copia de seguridad del contenido de esta columna. Este paso es opcional, pero es un paso adicional de seguridad.

