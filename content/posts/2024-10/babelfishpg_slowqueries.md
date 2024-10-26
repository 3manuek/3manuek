---
title: "[BabelfishPG] Enabling Statements Execution Time logging and Plans"
subtitle: "Configuration, plans and log format"
date: 2024-10-25
author: "3manuek"
draft: false
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
---

## Introduction


Even tho BabelfishPG is a Postgres flavor, there are a few configurations that might not
be as in vanilla. In this post, we focus on how to log query timings and enable showing query
plans.

No, [`log_min_duration_statements`](https://postgresqlco.nf/doc/en/param/log_min_duration_statement/16/) does 
not log TSQL statements. Queries execute through a different backend fork, so targeted statements executed through the TDS protocol, won't we logged.

However, BabelfishPG does provide a way to log slow statements and, most importantly, Stored Procedures. 
It is quite detailed, but extremelly verbose.



{{< notice "info" >}}
Laboratory of this post is at [babelfishpg-lab](https://github.com/Plataform3/babelfishpg-lab). 
{{< /notice >}}

{{< notice "warning" >}}
In this post, we cover `4.2.0`. There is a slight difference in the logging from `4.1.1`.
{{< /notice >}}

## Available settings for tracing events

The following variables would allow you to enable the statement trace:


- [babelfishpg_tsql.trace_exec_time](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_time)
- [babelfishpg_tsql.trace_tree](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_tree)
- [babelfishpg_tsql.trace_exec_nodes](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_nodes)
- [babelfishpg_tsql.trace_exec_counts](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_counts)

The [babelfishpg_tsql.tds_debug_log_level](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tdstds_debug_log_level) allows
4 levels of debug from 0 to 3. 

{{< notice "info" >}}
All these settings can be _reloaded_ without restarting the server.
{{< /notice >}}



## Log format

At this point, you may think if PGBadger works for parsing logs, and it does for most of the entries. However
you will see that it adds certain non-vanilla prefixes to the statements. So, it works, but it doesn't filter
the query timing.

The output of the log entry for statements is:

```bash
2024-10-26 19:47:22.677 UTC [117] CONTEXT:  PL/tsql function generate_date() line 9 at GOTO
        SQL statement "INSERT [Users] (username, balance)
                SELECT generate_username(), CAST(RAND()*100000 AS MONEY);"
        PL/tsql function generate_random_users(integer) line 8 at SQL statement
        SQL statement "EXEC generate_random_users 1000"
        PL/tsql function inline_code_block line 2 at EXEC
        TDS Protocol: Message Type: SQL BATCH, Phase: TDS_REQUEST_PHASE_PROCESS. Writing Done Token
2024-10-26 19:47:22.680 UTC [117] LOG:  Execution Trace: 
        Execution Summary: master_dbo.generate_random_users total execution code size 6, total execution time 5579ms
        [  0] COND GOTO 4 (master_dbo.generate_random_users:0)                      (C:1001, T:     0ms)
        [  1] SQL statement (master_dbo.generate_random_users:8)                    (C:1000, T:  5029ms)
        [  2] assignment (master_dbo.generate_random_users:10)                      (C:1000, T:     0ms)
        [  3] GOTO 0 (master_dbo.generate_random_users:0)                           (C:1000, T:     0ms)
        [  4] RETURN (master_dbo.generate_random_users:0)                           (C:  1, T:     0ms)
        [  5] GOTO 6 (master_dbo.generate_random_users:0)                           (C:  1, T:     0ms)
```

## Query Plans

Variables for configuring the showplan:

- [babelfishpg_tsql.showplan_all](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_all)
- [babelfishpg_tsql.showplan_text](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_text)
- [babelfishpg_tsql.showplan_xml](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_xml)

Execution example and output:

```sql
1> set babelfish_showplan_all on
2> SELECT TOP 5 
3>     U.username, 
4>     SUM(S.points) AS total_points
5> FROM 
6>     Users U
7>     JOIN ScoreBoard S ON U.username = S.username
8> GROUP BY 
9>     U.username
10> ORDER BY 
11>     total_points DESC;
12> GO
QUERY PLAN
Query Text: SELECT TOP 5 
    U.username, 
    SUM(S.points) AS total_points
FROM 
    Users U
    JOIN ScoreBoard S ON U.username = S.username
GROUP BY 
    U.username
ORDER BY 
    total_points DESC
Limit  (cost=94.33..94.34 rows=5 width=36)
  ->  Sort  (cost=94.33..96.88 rows=1020 width=36)
        Sort Key: (sum(s.points)) DESC NULLS LAST
        ->  HashAggregate  (cost=64.64..77.39 rows=1020 width=36)
              Group Key: u.username
              ->  Hash Join  (cost=32.95..58.49 rows=1230 width=34)
                    Hash Cond: ((s.username)::"varchar" = (u.username)::"varchar")
                    ->  Seq Scan on scoreboard s  (cost=0.00..22.30 rows=1230 width=34)
                    ->  Hash  (cost=20.20..20.20 rows=1020 width=32)
                          ->  Seq Scan on users u  (cost=0.00..20.20 rows=1020 width=32)
(20 rows affected)
```




