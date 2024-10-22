---
title: "[BabelfishPG] Tracing Slow Statements"
subtitle: "It doesn't work as you may expect"
date: 2024-10-20
author: "3manuek"
draft: true
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
---

## No, [`log_min_duration_statements`](https://postgresqlco.nf/doc/en/param/log_min_duration_statement/16/) does not log TDS statements

Queries execute through a different backend fork, so targeted statements executed through the TDS protocol,
won't we logged.

However, BabelfishPG does provide a way to log slow statements and, most importantly, Stored Procedures. 
It is quite detailed, but extremelly verbose.

Laboratory of this post is at [babelfishpg-lab](https://github.com/Plataform3/babelfishpg-lab).


## Available settings for tracing events

The following variables would allow you to enable the statement trace:


- [babelfishpg_tsql.trace_exec_time](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_time)
- [babelfishpg_tsql.trace_tree](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_tree)
- [babelfishpg_tsql.trace_exec_nodes](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_nodes)
- [babelfishpg_tsql.trace_exec_counts](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_counts)


The [babelfishpg_tsql.tds_debug_log_level](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tdstds_debug_log_level) allows
4 levels of debug from 0 to 3. 



[babelfishpg_tsql.showplan_all](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_all)
[babelfishpg_tsql.showplan_text](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_text)
[babelfishpg_tsql.showplan_xml](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_xml)

```sql
set babelfish_showplan_all on
GO
<query>
GO
```


## Log format


At this point, you may think if PGBadger works for parsing logs, and it does for most of the entries. However
you will see that it adds certain non-vanilla prefixes to the statements. So, it works, but it doesn't filter
the query timing.



## Tooling



