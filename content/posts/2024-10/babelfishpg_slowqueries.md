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

## No, `log_min_duration_statements` does not work for TSQL statements

Queries execute through a different backend fork, so targeted statements executed through the TDS protocol,
won't we logged.

However, BabelfishPG does provide a way to log slow statements and, most importantly, Stored Procedures. 
It is quite detailed, but extremelly verbose.


## Available settings for tracing events


https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_all
https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_text
https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_xml

https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_tree
https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_nodes
https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_counts
https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_time

https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tdstds_debug_log_level


## Log format


At this point, you may think if PGBadger works for parsing logs, and it does for most of the entries. However
you will see that it adds certain non-vanilla prefixes to the statements. So, it works, but it doesn't filter
the query timing.



## Tooling



