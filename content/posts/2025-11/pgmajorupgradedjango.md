---
title: "Upgrading Postgres Major, and Django model with Logical Replication."
subtitle: "Logical Replication can be more flexible than it seems."
date: 2025-11-15
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - Python
  - Django
---

# The story

A customer needed to upgrade their Aurora RDS Postgres from v13 to v16 due to **v13's EOL**. This is a common requirement, and so far, a straightforward process. 
The complexity arose when they needed to upgrade their application model, which was taking a long time to run due that most of the tables required a full rewrite.

The Django migration was taking several hours to run, which made a blue/green upgrade and subsequent migration execution unfeasible due to the long downtime it would incur.

So, we decided to try a more sophisticated approach: 

1. Create an empty schema with the migration already applied in a v16
2. Add the deprecated columns in the destination cluster (to prevent Logical Replication from complaining)
3. Set up Logical Replication
4. Fix schema drift by removing the added columns after the switchover. 

This way, the switchover would be almost seamless.


{{< notice "info">}}
The rollback procedure consisted in creating a pub/sub from destination to origin. Keep in mind that the subscription may lack of some of the parameters, as it is an older version. v13 does not support: `streaming`, `run_as_owner`, and `disable_on_error`.
{{< /notice >}}

The intention of this article is to demonstrate that Logical Replication is not as strict as it may seem, considering that:

- The data types in the subscriber are not identical, but they share the same primitives or can be implicitly cast. Most of the tables were moving from `int` to `bigint` and some from `text` to `varchar`.
- Django migrations are strict, so we can circumvent this constraint by restoring the `django_migrations` table to avoid choosing the migration path. This is done due that de _origin_ cluster did not the last migrations done in the v16 version.
- If columns are missing in the destination, this would not be a problem if you use v15, as you can expand columns for each of the published tables. However, in this case, v13 lacks this feature, which is why we need to use `ADD COLUMN` and `DROP COLUMN`.
- New constraints were added and renamed in the new model version. These does not impact on the Logical Replication.


# The process

## 1) Schema and `django_migrations` table data

We dumped the _new schema_ to a file. This schema contained the Django migration applied. We also dumped the contents of the `django_migrations` table, as some migrations were run on the new v16 test instance.

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

## 2) Restore the schema into the new cluster

We created the cluster using a custom parameter group disabling the `autovacuum`. Once the new cluster is up, we restored the files that contained the schema, the new column, and the `django_migrations` data:

```bash
psql -f ./sql/schema.sql $PGURL_DESTINATION
psql -f ./sql/000_add_column.sql $PGURL_DESTINATION
psql -f ./sql/django_migrations_data.sql $PGURL_DESTINATION
```


## 3) Custom publication in the origin cluster

As we used PostGIS (`spatial_ref_sys` are updated with metadata, and not compatible with Logical Replication), we needed to expand the tables in the publication definition, so `FOR ALL TABLES` was not an option. In the RDS extension, PostGIS metadata lies under the `rdsadmin` ownership, so we only stream tables owned by the current user.


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

The command above outputs the command needed to create the expanded publication.

## 4) Create and enable subscription in the destination cluster

The below command creates the subscription on the destination cluster. 

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

You may noticed that we did not enable the subscription yet. We do this so we can enable it after:

```sql
ALTER SUBSCRIPTION subs_migration_v16 ENABLE;
```

Once the subscription was enabled, the streaming started.


## 5) Monitor the initial sync and replication lag

The cluster consisted in half terabyte of data, so it took a few hours to do the initial sync.

We can check the status of the initial sync by issuing the query:

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

We'll know when the initial sync is done once all tables are in _ready_ state (`r`).

The below queries allow to track the lag over the slot streaming:

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

Once the destination cluster has caught up, we're ready to proceed with the switchover.


## 6) Preparing for the switchover

{{< notice "info">}}
In Postgres v18, stats are restored, so no need to run _analyze_ on destination.
{{< /notice >}}

We run _vacuum analyze_ before proceeding with the switchover. In most cases, a plain _analyze_ would be sufficient. However, in our case, some tables are heavily written, so we executed:

```sql
VACUUM ANALYZE;
```

After vacuum is done, we restarted the destination cluster to re-enable `autovacuum`.

## 7) Switchover and sequence sync

Unfortunately, in this case the customer lacks of a pgbouncer fleet, so writes needed to be stopped in the application. However, as we were doing an application upgrade either, there was no option than deploy the new application version anyway.

During the phase in which writes were stopped, we needed to sync the sequences. 

{{< notice "info">}}
v18 does not requires this step, as sequences are streamed on Logical Replication.
{{< /notice >}}

The following queries do the same. We executed on the origin cluster, and their output executed on the destination:


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

After this step:

- We deployed the application pointing to the destination cluster.
- We created publication in destination.
- Created rollback subscription in origin. As mentioned, v13 lacks of some of the parameters we used in the main subscription:
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

## 8) Cleanup LR subscription, slot and publication

On destination, we proceeded with the subscription removal:

```sql
DROP SUBSCRIPTION subs_migration_v16;
```

On origin, we removed the publication:

```sql
DROP PUBLICATION migration_v16_expanded_pub;
```

We still had the rollback subscription. Once the tolerance period passed, we proceeded with the rollback pub/sub, and remmoved the additional column added:

```sql
BEGIN;
    CREATE TABLE IF NOT EXISTS public.__backup__<table> AS
    SELECT id, <column>
    FROM public.<table>;

    ALTER TABLE public.<table>
      DROP COLUMN <column>;
COMMIT;
```

The above does just a backup of the contents of this column. This step is optional, but an extra safe step.