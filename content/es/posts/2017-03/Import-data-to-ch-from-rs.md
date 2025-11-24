---
title: "Importar datos de Redshift a Clickhouse en un solo comando."
subtitle: "Importando y explicando el proceso."
excerpt: ""
date: 2017-03-06
author: "3manuek"
draft: false

series: "Clickhouse"
tags:
  - Clickhouse
  - Redshift
---

![Clickhouse Redshift](/images/posts/redshift+clickhouse.jpg)

## Alcance 

Si has oído sobre Clickhouse y te estás preguntando cómo probar con tus datos residiendo en Redshift, aquí hay un comando
que te mostrará algunos consejos para acelerarte.

Actualización (4 de julio): Hay una serie de posts sobre comparaciones Clickhouse vs Redshift, el primer post es [este][1].

La forma estándar de mover tus datos fuera de Redshift es usando el comando [UNLOAD](http://docs.aws.amazon.com/redshift/latest/dg/r_UNLOAD.html),
que empuja la salida a archivos S3. No sorprendentemente, Redshift no soporta
`COPY (<query>) TO STDOUT`, lo que podría hacer la vida más fácil (ya que está
basado en Postgres versión 8.0.2, bastante antiguo). Información sobre esto, [aquí](http://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html).

Clickhouse soporta varios motores pero hasta ahora, seguramente comenzarás con MergeTree. Los tipos soportados son más finitos,
aunque deberían ser suficientes para análisis simples. Se recomienda agregar soporte de sampling en la creación de la tabla
, en los parámetros del motor a través de la función hash correspondiente con el tipo de columna que _devuelve enteros sin signo_ después de la definición de la clave.
En este caso he elegido cityHash64 ya que no es criptográfico, tiene una precisión decente y mejor rendimiento.

La tabla en CH es la siguiente:

```sql
CREATE TABLE thenewdb.thetable (
normdate Date,
id String,
datefield DateTime,
(... many others ...)
data String
)
ENGINE = MergeTree(normdate,cityHash64(id), (datefield, id,cityHash64(id)),8192);
```

> NOTA: Los parámetros del motor son: una columna de fecha, la expresión de sampling opcional (cityHash64)
> la clave primaria (datefield,id) y la granularidad del índice.

La tabla en Redshift es:

```sql
     Column     |            Type             | Modifiers
----------------+-----------------------------+-----------
 id             | character varying(32)       | not null
 datefield      | timestamp without time zone | not null
 (... other columns...)
  data           | character varying(8192)     |
Indexes:
    "thetable_pkey1" PRIMARY KEY, btree (id)
```

ClickHouse requiere una columna Date, que termina siendo una columna adicional
en tu estructura de tabla. Para más información,
revisa la [doc de MergeTree](https://clickhouse.yandex/reference_en.html#MergeTree).


## La magia

- Abre una sesión screen/ tmux.

- Ejecuta el comando:

```bash
time psql -h rs1.garbagestring.redshift.amazonaws.com \
          -p 5439 -U redshift thedatabase \
          -Antq --variable="FETCH_COUNT=1000000" -F $'\t' <<EOF | \
          clickhouse-client --database thenewdb --query="INSERT INTO thenewdb.thetable FORMAT TabSeparated"
select trunc(datefield),
  id,
  datefield::timestamp(0) ,
  store_id ,
(... many columns more ... )
  regexp_replace(data,'\\t|\\n','') 
from theoriginaltable
EOF
```

## Cálculo de RAM  

El motor `MergeTree` es de hecho una implementación interesante. No es un LSM ya que
no procesa en _memtables_ ni tampoco en _log_. Procesa los datos en lotes y escribe
directamente al sistema de archivos, consumiendo una cantidad significativa de RAM a costa
de ahorrar operaciones de disco (y ocasionalmente ciclos de CPU) por workers en segundo plano que hacen los merges.

Un error común cuando te quedas sin memoria debido a estos procesos de merge consumiendo RAM es:

```
Code: 240. DB::Exception: Allocator: 
Cannot mremap., errno: 12, strerror: Cannot allocate memory
```

La razón por la que esto sucede es debido a la RAM consumida en merges en segundo plano.
Hay cinco elementos a tener en cuenta para calcular la memoria necesaria:

- `background_pool_size` es 6, determinando el número máximo de merges en segundo plano.
- Número máximo de piezas de merge durante el merge (predeterminado 100)
- tamaño de bloque para el merger (8192 filas)
- tamaño promedio de fila sin comprimir
- overhead máximo de asignación de memoria para buffers (2)

Puedes asumir un tamaño de fila de 1024 bytes y multiplicar todo lo anterior
junto. p.ej. `SELECT formatReadableSize( 2* 6 * 100 * 8192 * 1024);`

El problema actual es que el algoritmo de merge procesa por fila en lugar de cada
columna por separado, y se espera tener una ganancia de rendimiento. Puedes probar
el _algoritmo vertical_ estableciendo `enable_vertical_merge_algorithm` en el
archivo de configuración.

Entonces, adivinando que obtienes un tamaño de fila de `13557 bytes (14k)` medido usando la consulta 1),
puedes obtener una aproximación de RAM necesaria para el bloque de operaciones 2).

1)

```
time psql -h rs-clusterandhash.us-east-1.redshift.amazonaws.com\
 -p 5439 -U redshift reportdb  -Antq --variable="FETCH_COUNT=1000000" -F $'\t' <<EOF | wc -c
select
  *
from big_table
LIMIT 1
EOF
13835
```

2) 
```
SELECT formatReadableSize((((2 * 6) * 100) * 8192) * 13557)
┌─formatReadableSize(multiply(multiply(multiply(multiply(2, 6), 100), 8192), 13557))─┐
│ 124.12 GiB                                                                         │
└────────────────────────────────────────────────────────────────────────────────────┘
```
 
Más información sobre esto en este [hilo de google groups](https://groups.google.com/forum/#!topic/clickhouse/SLlMNwIOtmY).


Desafortunadamente, el cliente aún no puede manejar esto apropiadamente. Incluso limitando el uso de memoria
con `--max_memory_usage 5GB` (p.ej), obtendrás un error diferente como este:

```
Code: 241. DB::Exception: 
Received from localhost:9000, 127.0.0.1. 
DB::Exception: Memory limit (for query) exceeded: 
would use 1.00 MiB (attempt to allocate chunk of 1048576 bytes), maximum: 5.00 B.
```

Si la RAM necesaria está muy cerca de tu recurso actual, una posible solución sería usar el motor `ReplacingMergeTree`, 
pero la deduplicación no está garantizada y de hecho jugarás en límites muy pequeños (deberías estar 
muy cerca del cálculo anterior).
También, hay varios ajustes a nivel de motor para afinar el motor mergetree a través de configuración
en [MergeTreeSettings.h](https://github.com/yandex/ClickHouse/blob/9de4d8facb412fa178cd8380a4411c30da43acc7/dbms/src/Storages/MergeTree/MergeTreeSettings.h)

p.ej., lo siguiente reducirá el consumo de RAM considerablemente, a costa de reducir 
durabilidad y cambiar el algoritmo de merge:
 
```
    <merge_tree>
        <max_suspicious_broken_parts>20</max_suspicious_broken_parts>
        <enable_vertical_merge_algorithm>1</enable_vertical_merge_algorithm>
        <max_delay_to_insert>5</max_delay_to_insert>
        <parts_to_delay_insert>100</parts_to_delay_insert>
    </merge_tree>
```


## La explicación

- ¿Por qué TabSeparated?

Clickhouse ofrece varios [formatos](https://clickhouse.yandex/reference_en.html#Formats) de entrada/salida, muchos.
Aunque, el tab en este caso parecía suficiente para importar textos simples
(hasta que un JSON mágico con tabs y saltos de línea rompió la importación).

- ¿Por qué castear sin microsegundos `::timestamp(0)`?

CH no soporta microsegundos. 

- ¿Por qué hacer replace `regexp_replace(data,'\\t|\\n','')`?

Estamos importando usando TSV, que por estándar no
soporta saltos de línea y obviamente, tabs. Desafortunadamente, 
no es posible en este momento usar codificación/decodificación usando
base64 para insertar sin reemplazar (haciendo stream de los
datos codificados y decodificando sobre la marcha por Clickhouse). 

- ¿Por qué `--variable="FETCH_COUNT=1000000"`?

Esta es la salsa. `psql` intentará colocar todo el conjunto de resultados
en memoria, haciendo que la caja explote en unos pocos minutos
después de comenzar a ejecutarse. Con esto, crea un cursor del lado del servidor, permitiéndonos importar conjuntos de resultados más grandes que la máquina
cliente.


- ¿Por qué `-F $'\t'`?

Dependiendo de tu shell, puedes considerar [esto](https://www.postgresql.org/message-id/455C54FE.5090902@numerixtechnology.de). Necesitas usar un _tab literal_, 
lo que significa que necesita ser el carácter mismo. En UNIX
`Ctrl-V tab` debería hacerlo.

Puedes hacer una pequeña prueba sobre esto con `echo`. La opción `-e`
_permite la interpretación de escapes de backslash_. También `printf`
es una opción limpia para imprimir caracteres especiales.


```bash
ubuntu@host:~$ echo $'\n'

ubuntu@host:~$ echo '\n'
\n
ubuntu@host:~$ echo -e '\n'

```

## Números rebeldes

El proceso en sí es considerablemente rápido: movió una tabla de 15GB a un MergeTree de Clickhouse de alrededor de 11GB en 20 minutos. 

Detalles de instancia para RS: dc1.large 15GB RAM, vCPU 2, 2 nodos + 1 coordinador
Instancia CH: EC2 r4.2xlarge única, volumen 3000 iops EBS

¡Espero que encuentres este consejo útil!


[1]: https://www.altinity.com/blog/2017/6/20/clickhouse-vs-redshift

