---
title: "[BabelfishPG] Habilitando el registro de tiempo de ejecución de statements y planes"
subtitle: "Configuración, planes y formato de log"
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

## Introducción

{{< notice "info" >}}
El laboratorio para este post se puede encontrar en [babelfishpg-lab](https://github.com/Plataform3/babelfishpg-lab).  
{{< /notice >}}

{{< notice "warning" >}}
En este post cubrimos la versión `4.2.0`. Hay una ligera diferencia en la configuración y formato de logging desde `4.1.1`.
{{< /notice >}}

Aunque BabelfishPG es una variante de Postgres, la configuración se hace a través de sus extensiones (babelfish_tds y babelfish_tsql). En este post, nos enfocamos en cómo registrar tiempos de consulta y habilitar mostrar planes de consulta.

Para Postgres vanilla, puedes registrar consultas lentas configurando [`log_min_duration_statements`](https://postgresqlco.nf/doc/en/param/log_min_duration_statement/16/), pero esto no registrará statements TSQL. Las consultas se ejecutan a través de un fork de backend diferente, por lo que los statements dirigidos ejecutados a través del protocolo TDS, no se registrarán.

Sin embargo, BabelfishPG sí proporciona una forma de registrar statements lentos y, lo más importante, Stored Procedures. 
Es bastante detallado, pero extremadamente verboso.


## Configuraciones disponibles para rastrear eventos

Las siguientes variables de la extensión `babelfish_tsql`, te permitirían habilitar el rastreo de statements:


{{< notice "info" >}}
Todas estas configuraciones se pueden _recargar_ sin reiniciar el servidor.
{{< /notice >}}

- [babelfishpg_tsql.trace_exec_time](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_time)
- [babelfishpg_tsql.trace_tree](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_tree)
- [babelfishpg_tsql.trace_exec_nodes](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_nodes)
- [babelfishpg_tsql.trace_exec_counts](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqltrace_exec_counts)

La extensión `babelfish_tds` controla la verbosidad del log a través de la configuración [babelfishpg_tds.tds_debug_log_level](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tdstds_debug_log_level), que proporciona 4 niveles de debug, de 0 a 3 siendo `1` el predeterminado, que es suficientemente verboso para propósitos de análisis de consultas.


## Formato del log

En este punto, puedes pensar si [PGBadger](https://pgbadger.darold.net/) funciona para analizar logs, y lo hace para la mayoría de las entradas. Sin embargo
verás que agrega ciertos prefijos no-vanilla a los statements en el reporte. Entonces, funciona, pero no filtra
el tiempo de consulta.

La salida de la entrada del log para statements es:

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

BabelfishPG proporciona una forma de obtener el Plan de Consulta desde la conexión TDS. Configuraciones para configurar el showplan:

- [babelfishpg_tsql.showplan_all](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_all)
- [babelfishpg_tsql.showplan_text](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_text)
- [babelfishpg_tsql.showplan_xml](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlshowplan_xml)

Ejemplo de ejecución y salida:

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




