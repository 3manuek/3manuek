---
title: "Nueva característica pg-stat-ramdisk-size de PostgreSQL RDS y sus cálculos"
subtitle: "Si estás usando RDS, querrás leer esto."
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


> NOTA IMPORTANTE:
> Esto ya ha sido abordado en el core de PostgreSQL, pero esta opción
> aún está disponible en RDS.

![RDS](/images/posts/postgres+rds.png)

## ¿Qué cambia y por qué es tan importante?

Rastrear contadores de bases de datos y _no solo tablas_ en Postgres no es barato, pero desde hace algún tiempo había workarounds involucrando la configuración de un ramdisk para colocar el directorio apuntado por la variable GUC `stat_temp_directory`. Ese directorio coloca un `global.stat` y archivos de estadísticas por base de datos llamados como `db_<oidOfDB>.stat`. Aunque el mecanismo para escribir en estos archivos evita flushes extra o innecesarios, es muy intensivo en escritura.

Este cambio no requiere ningún downtime (en instalaciones standalone), ya que un simple reload forzará al Stat Collector a reescribir los archivos en la carpeta. Hay un blog bastante claro sobre [poner stat_temp_directory en un ramdisk](http://hacksoclock.blogspot.com.ar/2014/04/putting-statstempdirectory-on-ramdisk.html).

El problema reside en la falta de privilegios de RDS para manipular contenido de archivos o directorios, lo que no te permite verificar el tamaño actual y establecer un valor apropiado. Aunque, probablemente querrás saber que hay un límite de *1 GB* para esta configuración en RDS.

Si no quieres más detalles y quieres aliviar tu almacenamiento, configúralo a 256 MB y continúa con tu vida. Aunque es una configuración grande (el siguiente párrafo explica por qué), no querrás quedarte corto en esto.

Después de aplicar el cambio sobre `pg_stat_ramdisk_size`, verás que la ubicación en RDS ha cambiado:

```
show stats_temp_directory;
   stats_temp_directory    
---------------------------
 /rdsdbramdisk/pg_stat_tmp
```

## TL;DR *¿Cuál es el tamaño esperado del stat_temp_directory*?

Antes de avanzar, detallemos la estructura de las entradas para el archivo de estadísticas:

| Estructura/Constante          | Tamaño
|-----|----
| PGSTAT_FILE_FORMAT_ID  | 1 byte
| PgStat_StatTabEntry  | 164 bytes
| PgStat_StatFuncEntry | 28 bytes
| closingChar | 'E'
| describers  | char (T o F en este caso)


Primero que nada, como se explicará más adelante, no todas las tablas, índices y funciones se escriben en el _archivo de estadísticas de la base de datos_. Básicamente, una fórmula básica será:

> _SizeOfDBStatFile = PGSTAT_FILE_FORMAT_ID + describers +
>                     (tableCount * PgStat_StatTabEntry) + (funcCount * PgStat_StatFuncEntry) +
>                     closingChar_

Para obtener el espacio estimado necesario para las tablas actuales en cada base de datos (ten
en cuenta que esto considera todas las tablas volcadas en archivo), hay una consulta que puedes ejecutar
de forma segura en _cada base de datos en tu instancia PostgreSQL_ (el archivo de estadísticas es uno _por base de datos_):


```sql
SELECT count(*) * 164 "size in bytes"
  FROM pg_class
  WHERE relkind ('r','i','S');
```

También, necesitas hacer lo mismo dentro de `pg_proc`, pero en su lugar el factor será 28 bytes. Necesitarás ejecutar esto en cada base de datos, y sumarlos todos. Esto es para rastrear estadísticas de uso de funciones, que pueden
deshabilitarse desde el archivo `postgresql.conf` con la variable `track_functions`. También, todos los aspectos
de estadísticas de tiempo de ejecución se pueden encontrar [aquí][1].


### Estadísticas Globales

Estructura de las estadísticas globales:

| Estructura          | Tamaño
|-----|----
| PgStat_StatDBEntry | 180 bytes
| PgStat_GlobalStats | 92 bytes
| PgStat_ArchiverStats | 114 bytes
| describer            | char ('D')

El archivo de estadísticas globales es más pequeño, y contiene solo las estadísticas globales y los contadores a través de bases de datos. Debería ser algo cercano a:

> _PGSTAT_FILE_FORMAT_ID + describer + PgStat_GlobalStats +
> PgStat_ArchiverStats + (PgStat_StatDBEntry + describer) * numDatabases_.

Entonces, como puedes ver, la limitación impuesta por AWS en este respecto está muy por encima de la cantidad de datos mantenidos en este directorio en la mayoría de las bases de datos que pueden ejecutarse dentro de las expectativas de RDS.

## ¿Por qué afecta a RDS?

Antes de que se agregara esta característica, el `stat_temp_directory` tenía un lugar en la capa de almacenamiento persistente. Esto era lo mismo que cualquier otra instalación de Postgres por defecto, sin embargo debido a las características de almacenamiento de RDS el impacto podría considerarse mayor que una configuración standalone.

Si tu aplicación es intensiva en escritura, verás el impacto en la latencia de escritura y operaciones.


## Una mirada más profunda

Entonces la [pregunta][2] no tardó mucho en aparecer en la red y, no fui la excepción. ¿Hay una forma de precalcular el contenido del directorio?  

No pude terminar con un número exacto sin embargo, puedes saber que el tamaño de los archivos está más relacionado con el número de tablas, índices, funciones y bases de datos. La siguiente estructura es el núcleo de esta implementación. Es tan importante que en realidad tiene un `PGSTAT_FILE_FORMAT_ID` definido que también se escribe en los archivos de estadísticas.

Todas las estructuras para estos contenidos de archivos se colocan en el header `include/pgstat.h` y su implementación se hace en `postmaster/pgstat.c` (ya que es un worker de inicio). Cada campo que se usa para contadores usa `int64` y hay algunos `timestampz` (64 bits también) con Oid como excepción, que está representado por 32 bits (unsigned int).

Los backends se comunican con el collector a través de la estructura `StatMsgType`, cuando es diferente de una estructura cero `PgStat_TableCounts`. Las estructuras se mantienen en memoria local del backend mientras acumulan contadores. Entonces, eso significa que no todas las tablas, índices y funciones tendrán una entrada.

¿Qué backends pueden solicitar una escritura de archivo? Todos los backends, el archiver, el bgwriter. Todos ellos usan la misma estructura para pasar los cambios (PgStat_Msg).

Hay 2 funciones para escribir (`pgstat_write_db_statsfile`, `pgstat_write_statsfiles`) y 2 para leer (`pgstat_read_db_statsfile` ,`pgstat_read_statsfiles` ) cada una de esas controlando ya sea el `db_<oid>.stat` y `global.stat`.


## Referencias

### PgStat_StatDBEntry

La estructura HTAB es opaca, y mantiene un mapa hash de tablas y funciones para ser recolectadas. No nos importa el tamaño de estos mapas ya que no se escribirán en el archivo de estadísticas de todos modos. La entrada completa de la base de datos es `22 * 64 bit` valores + `1 * 32 bits`, por base de datos (*180 bytes*).

```c
#define PGSTAT_FILE_FORMAT_ID   0x01A5BC9D
typedef struct PgStat_StatDBEntry
{
        /*
        NOTA:
        El tipo oid está actualmente implementado como un entero sin signo de cuatro bytes.
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
        PgStat_Counter n_block_read_time;       /* tiempos en microsegundos */
        PgStat_Counter n_block_write_time;

        TimestampTz stat_reset_timestamp;
        TimestampTz stats_timestamp;    /* tiempo de actualización del archivo de estadísticas de la base de datos */

        /*
         * las tablas y funciones deben estar al final en la estructura, porque no escribimos
         * los punteros al archivo de estadísticas.
         */
        HTAB       *tables;             // definido en utils/hsearch.h
        HTAB       *functions;
} PgStat_StatDBEntry;
```



### Estructuras

En general, este es el tamaño de estructura de cada una:

Estructura | Detalle | Total
----|-----|------
PgStat_StatTabEntry | 20 * 64 bits y 1 * 32 Oid | (164 bytes)
PgStat_StatFuncEntry | 3 * 64 bits y 1 * 32 Oid | (28 bytes)
PgStat_GlobalStats | 11 * 64 bits, 8 bytes + 1 * 32 bit, 4 bytes | (92 bytes)
PgStat_ArchiverStats | 4 *  8bytes, 2 char 41 bytes. | (114 bytes)


¡Espero que hayas disfrutado el artículo!

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

