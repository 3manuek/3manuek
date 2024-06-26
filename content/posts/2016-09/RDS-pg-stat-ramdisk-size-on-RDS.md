---
title: "PostgreSQL RDS pg-stat-ramdisk-size new feature and its calculations"
subtitle: "If you are using RDS, you want to read this."
excerpt: ""
date: 2016-09-25
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - RDS
  - Postgres
  - AWS
# layout options: single or single-sidebar
layout: single

---


> IMPORTANT NOTE:
> This has been already addressed in PostgreSQL core, but this option
> is still available in RDS.

![RDS](/images/posts/postgres+rds.png)

## What does it change and why is so important?

Tracking databases and _not just tables_ counters in Postgres isn't cheap, but since some time ago there were workarounds involving the setup of a ramdisk to place the directory pointed by `stat_temp_directory` GUC variable. That directory places a `global.stat` and a per-database stat files called like `db_<oidOfDB>.stat`. Although the mechanism for writing into these files avoids extra or unnecessary flushes, it is very write intensive.

This change does not require any downtime (in standalone installations), as a simple reload will force the Stat Collector to rewrite the files on the folder. There is a pretty much clear blog on [putting stat_temp_directory on a ramdisk](http://hacksoclock.blogspot.com.ar/2014/04/putting-statstempdirectory-on-ramdisk.html).

The problem relies on the RDS lack of privileges to manipulate file or directory contents, which does not allow you to check the current size and set a proper value. Although, you may probably want to know that there is a limit of *1 GB* for this setting in RDS.

If you don't want any further details and you want to relief your storage, set it to 256 MB and continue with your life. Even though is a large setting (next paragraph explain why), you don't want to fall short on it.

After you apply the change over `pg_stat_ramdisk_size`, you will see the location in the RDS have changed:

```
show stats_temp_directory;
   stats_temp_directory    
---------------------------
 /rdsdbramdisk/pg_stat_tmp
```

## TL;DR *What's the expected size of the stat_temp_directory*?

Before move forward, lets detail the structure of the entries for the stat file:

| Structure/Constant          | Size
|-----|----
| PGSTAT_FILE_FORMAT_ID  | 1 byte
| PgStat_StatTabEntry  | 164 bytes
| PgStat_StatFuncEntry | 28 bytes
| closingChar | 'E'
| describers  | char (T or F in this case)


First of all, as it'll explained later, not all the tables, indexes and functions are written on the _db statsfile_. Basically, a basic formula will be:

> _SizeOfDBStatFile = PGSTAT_FILE_FORMAT_ID + describers +
>                     (tableCount * PgStat_StatTabEntry) + (funcCount * PgStat_StatFuncEntry) +
>                     closingChar_

In order to get the estimate space needed for the current tables on each database (keep
in mind that this considers all tables flushed on file), there is a query you can execute
safely on _each database in your PostgreSQL instance_ (statfile is one _per database_):


```sql
SELECT count(*) * 164 "size in bytes"
  FROM pg_class
  WHERE relkind ('r','i','S');
```

Also, you need to do the same within `pg_proc`, but instead the factor will be 28 bytes. You'll need to run this on every database, and sum them all. This is for tracking stats for function usage, which can be
disabled from the `postgresql.conf` file with the `track_functions` variable. Also, all the aspects
of runtime statistics can be found [here][1].


### Global Stats

Structure of the global stats:

| Structure          | Size
|-----|----
| PgStat_StatDBEntry | 180 bytes
| PgStat_GlobalStats | 92 bytes
| PgStat_ArchiverStats | 114 bytes
| describer            | char ('D')

The global statfile is smaller, and contains only the global stats and the counters across databases. Should be something close to:

> _PGSTAT_FILE_FORMAT_ID + describer + PgStat_GlobalStats +
> PgStat_ArchiverStats + (PgStat_StatDBEntry + describer) * numDatabases_.

So, as you can see, the limitation imposed by AWS in regarding is way above the amount of data held on this directory in most of the databases that can run inside RDS expectations.

## Why it affects RDS?

Prior to this feature been added, the `stat_temp_directory` had a place into the persistent storage layer. This was the same as any other Postgres installation by default, however due to the storage characteristics of RDS the impact could be considered higher than a standalone setup.

If your application is write intensive, you will see the impact on the Write latency and operations.


## A deeper look

So the [question][2] didn't took much time to appear in the network and, I wasn't the exception. Is there a way to pre calculate the contents of the directory?  

I couldn't end up with an exact number however, you may know that the size of the files are more related to the number of tables, indexes, functions and databases. The following structure is the core of this implementation. It is so important that it actually has a defined `PGSTAT_FILE_FORMAT_ID` that it is written also in the stat files.

All the structures for these file contents are placed in the `include/pgstat.h` header and its implementation is done in `postmaster/pgstat.c` (as it is a startup worker). Every field that is used for counters use `int64` and there are some `timestampz` (64 bits too) with Oid as an exception, which is represented by 32 bits (unsigned int).

Backends communicate to the collector through `StatMsgType` struct, when is different from a zeroed struct `PgStat_TableCounts`. Structures kept in backend local memory while accumulating counts. So, that means that not all the tables, indexes and functions will have an entry.

Which backends can request a file write? All the backends, the archiver, the bgwriter. All of them use the same structure for passing the changes (PgStat_Msg).

There are 2 functions for write (`pgstat_write_db_statsfile`, `pgstat_write_statsfiles`) and 2 for read (`pgstat_read_db_statsfile` ,`pgstat_read_statsfiles` ) each of those controlling either the `db_<oid>.stat` and `global.stat`.


## References

### PgStat_StatDBEntry

The HTAB structure is opaque, and it holds a hash map of tables and functions to be collected. We don't care about the size of this maps as it won't be written to the stats file anyway. The whole database entry is `22 * 64 bit` values + `1 * 32 bits`, per database (*180 bytes*).

```c
#define PGSTAT_FILE_FORMAT_ID   0x01A5BC9D
typedef struct PgStat_StatDBEntry
{
        /*
        NOTE:
        The oid type is currently implemented as an unsigned four-byte integer.
            typedef unsigned int Oid;
        */
        Oid                     databaseid;
        PgStat_Counter n_xact_commit;
        PgStat_Counter n_xact_rollback;
        PgStat_Counter n_blocks_fetched;
        PgStat_Counter n_blocks_hit;
        PgStat_Counter n_tuples_returned;
        PgStat_Counter n_tuples_fetched;
        PgStat_Counter n_tuples_inserted;
        PgStat_Counter n_tuples_updated;
        PgStat_Counter n_tuples_deleted;
        TimestampTz last_autovac_time;
        PgStat_Counter n_conflict_tablespace;
        PgStat_Counter n_conflict_lock;
        PgStat_Counter n_conflict_snapshot;
        PgStat_Counter n_conflict_bufferpin;
        PgStat_Counter n_conflict_startup_deadlock;
        PgStat_Counter n_temp_files;
        PgStat_Counter n_temp_bytes;
        PgStat_Counter n_deadlocks;
        PgStat_Counter n_block_read_time;       /* times in microseconds */
        PgStat_Counter n_block_write_time;

        TimestampTz stat_reset_timestamp;
        TimestampTz stats_timestamp;    /* time of db stats file update */

        /*
         * tables and functions must be last in the struct, because we don't write
         * the pointers out to the stats file.
         */
        HTAB       *tables;             // defined in utils/hsearch.h
        HTAB       *functions;
} PgStat_StatDBEntry;
```



### Structures

In overal, this is the structure size of each:

Structure | Detail | Total
----|-----|------
PgStat_StatTabEntry | 20 * 64 bits and 1 * 32 Oid | (164 bytes)
PgStat_StatFuncEntry | 3 * 64 bits and 1 * 32 Oid | (28 bytes)
PgStat_GlobalStats | 11 * 64 bits, 8 bytes + 1 * 32 bit, 4 bytes | (92 bytes)
PgStat_ArchiverStats | 4 *  8bytes, 2 char 41 bytes. | (114 bytes)


Hope you enjoyed the article!

<!-- 
{% if page.comments %}
<div id="disqus_thread"></div>
<script>


var disqus_config = function () {
this.page.url = {{ site.url }};  // Replace PAGE_URL with your page's canonical URL variable
this.page.identifier = {{ page.title }}; // Replace PAGE_IDENTIFIER with your page's unique identifier variable
};

(function() { // DON'T EDIT BELOW THIS LINE
var d = document, s = d.createElement('script');
s.src = '//3manuek.disqus.com/embed.js';
s.setAttribute('data-timestamp', +new Date());
(d.head || d.body).appendChild(s);
})();
</script>
<noscript>Please enable JavaScript to view the <a href="https://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>
{% endif %} -->

[1]: https://www.postgresql.org/docs/9.6/static/runtime-config-statistics.html
[2]: http://dba.stackexchange.com/questions/150474/how-to-determine-optimal-value-for-pg-stat-ramdisk-size-on-amazon-rds/150579#150579
