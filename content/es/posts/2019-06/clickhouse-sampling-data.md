---
title: "Sampling de Clickhouse en el motor MergeTree."
subtitle: "Cómo funciona MergeTree usando la característica de sampling"
excerpt: ""
date: 2017-07-01
author: "3manuek"
draft: false

series: "Clickhouse"
tags:
  - Clickhouse
# layout options: single or single-sidebar
layout: single
---

![Clickhouse](/images/posts/clickhouse.jpg)

## ¿Por qué el sampling es importante y de qué necesitas estar consciente?

Cuando lidias con cantidades muy grandes de datos, probablemente quieras ejecutar tus 
consultas solo para un conjunto de datos más pequeño en tus tablas actuales. Especialmente si tu conjunto de datos
no cabe en RAM.

`MergeTree` es el primer y más avanzado motor en Clickhouse que querrás probar.
Soporta indexación por Clave Primaria y es obligatorio tener una columna de tipo `Date`
(usada para particionamiento automático).

Es el único motor que soporta sampling, y solo _si la expresión de sampling fue definida
en la creación de la tabla_. Entonces, la regla general es que **si el conjunto de datos no cabe en RAM preferirás
crear la tabla con soporte de sampling**. De lo contrario, **no hay ganancia de rendimiento usando sampling
en tablas relativamente pequeñas que caben en RAM**.

La expresión de sampling usa una función hash sobre una columna elegida para generar pseudo aleatoriamente
datos en cada una de las columnas seleccionadas definidas en la clave primaria. Entonces puedes habilitar esta característica accediendo
a los datos usando la cláusula SAMPLE en la consulta. 

Los valores de las funciones de agregación no se corrigen automáticamente, así que para obtener un resultado aproximado, 
el valor 'count()' se multiplica manualmente por el factor de la muestra. Por ejemplo, una muestra
de 0.1 (10%) necesitará multiplicarse por 10, 0.2 necesitará multiplicarse por 5.

Supongamos que tenemos 96MM filas en una tabla distribuida, dividida en 2 shards:

```sql
SELECT count(*)
FROM database_report.stats_table_distributed

┌──count()─┐
│ 96414151 │
└──────────┘
1 rows in set. Elapsed: 0.026 sec. Processed 96.41 million rows, 192.83 MB (3.68 billion rows/s., 7.36 GB/s.)
```

Si usas `SAMPLE > 100`, probablemente obtendrás algunos resultados sucios, especialmente si ejecutas sobre
un paraguas distribuido. En el ejemplo siguiente es posible ver que el SAMPLE está sobre cada
tabla local
tabla local y agregado después localmente (hay 2 shards):

{{< tabs tabTotal="2" >}}

{{% tab tabName="Tabla Local" %}}
```sql
SELECT count(*)
FROM database_report.stats_table_local
SAMPLE 1000
┌─count()─┐
│    1015 │
└─────────┘
1 rows in set. Elapsed: 1.296 sec. Processed 48.21 million rows, 2.07 GB (37.18 million rows/s., 1.60 GB/s.)
```
{{% /tab %}}

{{% tab tabName="Tabla Distribuida" %}}
```sql
SELECT count(*)
FROM database_report.stats_table_distributed
SAMPLE 1000
┌─count()─┐
│    2032 │
└─────────┘
1 rows in set. Elapsed: 1.256 sec. Processed 96.41 million rows, 4.15 GB (76.75 million rows/s., 3.30 GB/s.)
```
{{% /tab %}}

{{< /tabs >}}




En su lugar, usando el formato de coeficiente relativo, las agregaciones son más precisas/consistentes en términos de filas totales
recolectadas, aunque necesitarás corregir la estimación dependiendo del coeficiente:

```sql

SELECT 
    count(*) AS count_over_sample,   -- Sin corregir, tenemos x10 menos filas
    count(*) * 10 AS count_estimated -- Por 10 ya que estamos muestreando 10% de la tabla
FROM database_report.stats_table_distributed
SAMPLE 1 / 10

┌─count_over_sample─┬─count_estimated─┐
│           9641965 │        96419650 │
└───────────────────┴─────────────────┘
1 rows in set. Elapsed: 1.442 sec. Processed 96.41 million rows, 4.15 GB (66.84 million rows/s., 2.87 GB/s.)
```

El camino de la ejecución en sampling se puede ver en la siguiente animación:


<div style="position:relative;height:0;padding-bottom:75.0%"><iframe src="https://www.youtube.com/embed/ah9sXSnMTcQ?ecver=2" width="480" height="360" frameborder="0" style="position:absolute;width:100%;height:100%;left:0" allowfullscreen></iframe></div>


## Funciones hash para sampling Int y Strings

Tienes varias funciones hash (intHash32 para enteros y cityHash64 para strings) aunque
puedes quedarte con aquellas no criptográficas para no afectar el rendimiento.

Ejemplo sin soporte de sampling: `MergeTree(EventDate, (CounterID, EventDate), 8192)`

Ejemplo con soporte de sampling: `MergeTree(EventDate, intHash32(UserID), (CounterID, EventDate, intHash32(UserID)), 8192)`

Los ejemplos en este artículo usan cityHash64, ya que el id es un `String`. También la distribución
es aleatoria, para garantizar la paralelización de las consultas:

```sql
CREATE TABLE database_report.stats_table_local ( ...)
ENGINE = MergeTree(normdate, cityHash64(id), (created_at, id, cityHash64(id)), 8192);   

CREATE TABLE database_report.stats_table_distributed AS database_report.stats_table_local 
ENGINE = Distributed(database_report, database_report, stats_table_local, rand());
```

## Manejo apropiado de precisión

Aquí hay otro ejemplo al recolectar agregaciones sobre sampling. La declaración siguiente 
es una consulta sin sampling:


```sql
SELECT DISTINCT 
    address,
    count(*)
FROM database_report.stats_table_distributed
GROUP BY address
HAVING count(*) > 500000
ORDER BY count(*) DESC

┌─address─────────┬─count()─┐
│ 10.0.1.222      │ 7431672 │
│ 1.3.2.1         │ 4727411 │
│ 104.123.123.198 │ 2377910 │
│ 10.0.20.110     │ 2366481 │
│ 10.0.5.6        │ 1852113 │
│ 12.1.2.4        │ 1413009 │
│ 54.84.210.50    │ 1141153 │
│ 63.138.62.1     │  950598 │
│ 10.1.0.11       │  738150 │
│ 10.0.1.15       │  709582 │
│ 90.110.131.100  │  601535 │
│ 65.30.67.32     │  584043 │
└─────────────────┴─────────┘
12 rows in set. Elapsed: 1.668 sec. Processed 96.41 million rows, 2.04 GB (57.79 million rows/s., 1.23 GB/s.)
```

Pero, si muestreamos sin corregir las agregaciones: 

```sql
SELECT DISTINCT 
    address,
    count(*)
FROM database_report.stats_table_distributed
SAMPLE 1 / 10
GROUP BY address
HAVING count(*) > 500000
ORDER BY count(*) DESC

┌─address────────┬─count()─┐
│ 10.0.0.222     │  744235 │
└────────────────┴─────────┘
1 rows in set. Elapsed: 2.127 sec. Processed 96.41 million rows, 6.00 GB (45.32 million rows/s., 2.82 GB/s.)
```

Puedes agregar algo de corrección alrededor y aumentar la muestra para obtener resultados más precisos:

```sql
SELECT DISTINCT 
    address,
    count(*) * 10
FROM database_report.stats_table_distributed
SAMPLE 1 / 10
GROUP BY address
HAVING (count(*) * 10) > 500000
ORDER BY count(*) DESC

┌─address─────────┬─multiply(count(), 10)─┐
│ 10.0.1.222      │               7442350 │
│ 1.3.2.1         │               4725650 │
│ 104.123.123.198 │               2381920 │
│ 10.0.20.110     │               2363170 │
│ 10.0.5.6        │               1856500 │
│ 12.1.2.4        │               1413860 │
│ 54.84.210.50    │               1141190 │
│ 63.138.62.1     │                954630 │
│ 10.1.0.11       │                739530 │
│ 10.0.1.15       │                712970 │
│ 90.110.131.100  │                604510 │
│ 65.30.67.32     │                583320 │
└─────────────────┴───────────────────────┘
12 rows in set. Elapsed: 2.134 sec. Processed 96.41 million rows, 6.00 GB (45.17 million rows/s., 2.81 GB/s.)

SELECT DISTINCT 
    address,
    count(*) * 5
FROM database_report.stats_table_distributed
SAMPLE 2 / 10
GROUP BY address
HAVING (count(*) * 5) > 500000
ORDER BY count(*) DESC

┌─address─────────┬─multiply(count(), 5)─┐
│ 10.0.1.222      │              7430545 │
│ 1.3.2.1         │              4730535 │
│ 104.123.123.198 │              2378665 │
│ 10.0.20.110     │              2364765 │
│ 10.0.5.6        │              1854600 │
│ 12.1.2.4        │              1412980 │
│ 54.84.210.50    │              1142130 │
│ 63.138.62.1     │               952105 │
│ 10.1.0.11       │               740335 │
│ 10.0.1.15       │               709805 │
│ 90.110.131.100  │               603960 │
│ 65.30.67.32     │               582545 │
└─────────────────┴──────────────────────┘
12 rows in set. Elapsed: 2.344 sec. Processed 96.41 million rows, 6.00 GB (41.13 million rows/s., 2.56 GB/s.)
```

## Advertencia de rendimiento

Si el conjunto de datos es más pequeño que la cantidad de RAM, el sampling no ayudará en términos de rendimiento.
Lo siguiente es un ejemplo de un conjunto de resultados más grande usando sin-sampling y sampling. 

```sql
SELECT 
    some_type,
    count(*)
FROM database_report.stats_table_distributed
GROUP BY some_type
HAVING count(*) > 1000000
ORDER BY count(*) DESC
[...]
15 rows in set. Elapsed: 1.534 sec. Processed 96.41 million rows, 1.95 GB (62.84 million rows/s., 1.27 GB/s.)

SELECT 
    some_type,
    count(*) * 10
FROM database_report.stats_table_distributed
SAMPLE 1 / 10
GROUP BY some_type
HAVING (count(*) * 10) > 1000000
ORDER BY count(*) DESC
[...]
15 rows in set. Elapsed: 2.123 sec. Processed 96.41 million rows, 5.90 GB (45.41 million rows/s., 2.78 GB/s.)
```

