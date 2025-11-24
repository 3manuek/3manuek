---
title: "Resumen de Full Text Search de InnoDB en MySQL 5.7."
subtitle: "Resumen de Full Text Search de InnoDB en MySQL (+5.7) con una aplicación dinámica."
excerpt: ""
date: 2016-04-26
author: "3manuek"
draft: false

series: "MySQL"
tags:
  - MySQL
---

![MySQL](/images/posts/mysql-search.png)

Aplicación principal:
[Resumen de Full Text Search de InnoDB (con Shiny/R)](https://3manuek.shinyapps.io/FTS_Innodb/)

## Créditos

> Autor: Emanuel Calvo
>
> Empresa: Pythian
>
> Gracias a Valerie Parham-Thompson @ Pythian y Daniel Prince @ Oracle.
>
> Repositorio disponible en [Github](https://github.com/3manuek/fts_article).

Para el artículo completo y la aplicación Shinyapp está disponible [aquí](https://3manuek.shinyapps.io/FTS_Innodb/).

## Algunos pensamientos iniciales

Hace un par de días uno de nuestros clientes llegó con una pregunta respecto a FTS
sobre el motor InnoDB. Aunque la pregunta no se responde en el artículo actual,
llegué a la conclusión de que FTS a veces se malinterpreta.

El punto de este _artículo_ es mostrar dinámicamente cómo funcionan los algoritmos de búsqueda,
usando datos no ficticios (las fuentes de datos se descargaron del [proyecto Gutenberg](www.gutenberg.org)
 ) dentro de una interfaz fácil.  

Para mostrar los efectos de los tamaños de campo sobre el algoritmo de expansión de consulta,
verás dos tablas principales (bookContent y bookContentByLine) ambas conteniendo
los mismos libros en diferentes enfoques: por línea y por párrafo. Verás el
ruido generado por el algoritmo `QUERY EXPANSION` cuando las frases son demasiado grandes.

El artículo actual ha sido desarrollado usando Shiny/R para permitirte ver
los efectos de los algoritmos.

Por el bien de la simplicidad, en este artículo no pasaremos por los parsers FTS.
Probablemente eso sería material para un post futuro.

## ¿Por qué considero que FTS a veces se malinterpreta?

FTS es una tecnología que puede usarse para cualquier propósito, no solo búsquedas simples.
Hay un mito de que FTS solo debería colocarse en clusters para ese propósito,
con lo cual estoy de acuerdo. Sin embargo, ciertas reglas de negocio requieren búsquedas complejas, y
tener tal característica puede ser una victoria.

Los RDBMS no son un buen lugar para cantidades masivas de consultas FTS, sin usar ninguna
de las capacidades de join que ofrecen, o las quejas ACID.

Como dije arriba, FTS es totalmente aceptable en RDBMS, si estás usando al menos
una característica crítica de RDBMS, requerida por tu modelo de negocio.

## ¡Acción!

Aquí hay un ejemplo de cómo los ranks difieren entre algoritmos y tamaños de campo usando la palabra 'country':

Para comenzar a mostrar los efectos de los algoritmos, el siguiente ejemplo busca
la palabra 'country' usando `query expansion`. Esto significa que no estamos buscando
solo las coincidencias exactas, sino también las entradas que aparecen más cuando
se ha encontrado la coincidencia exacta.

En la cláusula `SELECT` verás ambas expresiones FTS usando `NATURAL LANGUAGE`
con expansión de consulta y modos `BOOLEAN` respectivamente.


```sql
set global innodb_ft_aux_table = 'ftslab/bookContentByLine';

SELECT  content, bookid, group_concat(it.POSITION) as pos,
        round(MATCH(content) AGAINST ("country" IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION)) as QERank,
        round(MATCH(content) AGAINST ("country" IN BOOLEAN MODE)) as BoolRank
      FROM bookContentByLine bl join information_schema.INNODB_FT_INDEX_TABLE it
          ON (bl.FTS_DOC_ID = it.DOC_ID)  
      WHERE  MATCH(content) AGAINST ("country" IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION)
          AND it.WORD = 'country'
     GROUP BY FTS_DOC_ID
     ORDER BY 4 DESC
     LIMIT 10 ;
```

Resultado:

```
+-----------------------------------------------------------------------------+--------+-----+--------+--------+
|content                                                                      | bookid | pos | QERank |BoolRank|
+-----------------------------------------------------------------------------+--------+-----+--------+--------+
|"country in September, migrating into Holland, and leave their mates behind" |  15707 | 1   |    105 |      7 |
|"unsatisfied desire to serve his country, the two prevalent enthusiasms at"  |  15707 | 33  |     98 |      7 |
|"Language, Vol. I. p. 212. In this country, where four or five horses travel"|  15707 | 35  |     93 |      7 |
|"inflicting immense damage upon the country. Whereupon the Florentines"      |   1232 | 36  |     89 |      7 |
|"made for a country of twenty or thirty millionsâ€™ population, can be laid" |  39064 | 12  |     89 |      7 |
|"The spiders of this country manufacture nets of various forms, adapted to"  |  15707 | 21  |     87 |      7 |
|"a velvet-covered arm-chair at my head! This country is too decadent"        |  33415 | 45  |     86 |      7 |
|"country may be ennobled, and under its auspices may be verified that"       |   1232 | 1   |     84 |      7 |
|"name. The writer of this unpublished pamphlet sees his country in a"        |  39064 | 56  |     84 |      7 |
|"In our country, Mr. Pennant informs us, that some quails migrate, and"      |  15707 | 8   |     83 |      7 |
|"all the morning in passing over the adjacent country." (Voyage to Senegal," |  15707 | 46  |     82 |      7 |
|"the electoral system of the country. Immediately an outcry burst out"       |  39064 | 29  |     82 |      7 |
|"country, under a most excellent president, wherein all cities had their"    |   1232 | 1   |     81 |      7 |
|"Though in this country horses shew little vestiges of policy, yet in the"   |  15707 | 16  |     81 |      7 |
|"country districts. As Lucca had five gates, he divided his own country"     |   1232 | 1,63|     80 |     14 |
+-----------------------------------------------------------------------------+--------+-----+--------+--------+
15 rows in set (1,16 sec)
```


El ruido generado por la expansión de consulta es esperado y descrito en la documentación oficial [aquí](https://dev.mysql.com/doc/refman/5.7/en/fulltext-query-expansion.html).

El caso interesante es la siguiente fila, que tiene 2 ocurrencias exactas y no es el rank más alto usando expansión de consulta
. Recuerda, esto es esperado.

```
Texto: "country districts. As Lucca had five gates, he divided his own country"
bookid: 1232
pos: 1,63
QERank: 80
BoolRank: 14
```

Esto es aún peor cuando se usan oraciones grandes. En el ejemplo siguiente verás la misma consulta, contra la tabla
almacenando por párrafo. El rank booleano muestra algunas de las entradas muy por encima de otras, sin embargo la expansión de consulta
ubica en la parte superior registros que no necesariamente tienen muchas coincidencias exactas.

```sql
SET GLOBAL innodb_ft_aux_table = 'ftslab/bookContent';

SELECT bookid, FTS_DOC_ID,
                group_concat(it.POSITION) as positions,
                round(MATCH(content) AGAINST ("country" IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION)) as QERank,
                round(MATCH(content) AGAINST ("country" IN BOOLEAN MODE)) as BooleanRank,
                length(content) as len
          FROM bookContent bl join information_schema.INNODB_FT_INDEX_TABLE it ON (bl.FTS_DOC_ID = it.DOC_ID)  
          WHERE  MATCH(content) AGAINST ("country" IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION)
              AND it.WORD = 'country'
          GROUP BY FTS_DOC_ID
          ORDER BY QERank DESC
          LIMIT 10 ;
```

Resultado:

```
+--------+------------+-----------------+--------+-------------+-------+
| bookid | FTS_DOC_ID | positions       | QERank | BooleanRank | len   |
+--------+------------+-----------------+--------+-------------+-------+
|  16452 |      17637 | 942,2552,9084   |  32494 |          10 | 51790 |
|  16452 |      17827 | 31699           |  30232 |           3 | 51701 |
|  16452 |      17761 | 667,47646       |  29517 |           7 | 50264 |
|  16452 |      17791 | 13566           |  28888 |           3 | 49129 |
|  16452 |      17927 | 23259,7044      |  26731 |           7 | 48983 |
|  16452 |      17839 | 9012,199        |  24933 |           7 | 44451 |
|  16452 |      17815 | 29318           |  24745 |           3 | 44011 |
|  16452 |      17729 | 895,16485,24034 |  23305 |          10 | 42612 |
|  16452 |      17621 | 1765            |  19935 |           3 | 36698 |
|  16452 |      17803 | 3942            |  17552 |           3 | 30586 |
+--------+------------+-----------------+--------+-------------+-------+
10 rows in set (1,88 sec)
```

La expansión de consulta es útil cuando intentas buscar qué entradas contienen
más palabras que aparecen frecuentemente dentro del término de búsqueda. Tener campos de texto grandes
aumenta la probabilidad de tener más palabras que aparecen entre el término de búsqueda.
En el caso de la tabla `bookContent` (tabla por párrafo), el tamaño promedio de campo
es `r rs$len` caracteres.

## La `INNODB_FT_INDEX_TABLE`

Hay una forma de jugar con el contenido de los índices FTS. Como puedes haber notado
en los ejemplos anteriores, usé la declaración `set global innodb_ft_aux_table = 'ftslab/bookContent';`
, que carga el contenido del índice a memoria para una consulta fácil.

Si usas RDS, la opción `innodb_ft_aux_table` no está disponible ya que es GLOBAL
y requiere privilegios SUPER.

p.ej. Puedes obtener fácilmente los tokens más frecuentes:

```sql
SELECT WORD,count(*)
           FROM information_schema.INNODB_FT_INDEX_TABLE   
           group by WORD having count(*) > 1000
           order by 2
           limit 10;
```

Resultado:

```
+--------+----------+
| WORD   | count(*) |
+--------+----------+
| should |     1023 |
| yet    |     1027 |
| any    |     1070 |
| like   |     1071 |
| been   |     1073 |
| first  |     1080 |
| nor    |     1087 |
| your   |     1106 |
| thou   |     1130 |
| shall  |     1164 |
+--------+----------+
10 rows in set (5,40 sec)
```

Probablemente no es una información muy útil ya que la mayoría de estas palabras aparecen demasiado frecuentemente
y son verbos modales, adverbios, pronombres, determinantes, etc. Podría ser el caso de que
no estés interesado en indexar esas palabras. Si ese es el caso puedes agregarlas como `stopwords`
en tu propia tabla de stopwords. Especialmente si estás más interesado en búsquedas booleanas, perdiendo
alguna parte de las expresiones del lenguaje. Construí una consulta para esta situación para permitirnos construir
la tabla de stopwords usando las palabras actuales que queremos agregar al filtrado:

```
(ftslab) > select group_concat(WORD) FROM (select distinct WORD  
  FROM information_schema.INNODB_FT_INDEX_TABLE               
  group by WORD having count(*) > 1000) d\G
*************************** 1. row ***************************
group_concat(WORD): all,and,any,been,but,can,first,had,has,have,her,him,his,into,
its,like,may,more,nor,not,now,one,only,other,our,said,shall,she,should,some,such,
than,their,them,then,there,these,they,those,thou,thus,thy,time,were,which,would,
yet,you,your
1 row in set (5,28 sec)
```

Construyamos nuestra tabla de filtro usando tanto entradas predeterminadas como nuevas y manteniendo el
orden alfabético:

```sql
CREATE TABLE bookContentByLine_stopwords(value VARCHAR(30)) ENGINE = INNODB;

INSERT INTO bookContentByLine_stopwords
SELECT value FROM (
    SELECT value FROM
    INFORMATION_SCHEMA.INNODB_FT_DEFAULT_STOPWORD
    UNION
    SELECT DISTINCT WORD as value  
      FROM information_schema.INNODB_FT_INDEX_TABLE               
      GROUP BY WORD having count(*) > 1000
) allEntries
ORDER BY value ASC;

DROP INDEX ftscontent ON bookContentByLine;
SET GLOBAL innodb_ft_server_stopword_table = 'ftslab/bookContentByLine_stopwords';
CREATE FULLTEXT INDEX ftscontent ON bookContentByLine(content);

```


Verificar el contenido del índice es fácil como:


```
(ftslab) > select *
          from information_schema.INNODB_FT_INDEX_TABLE
          WHERE lower(WORD) like '%country%';
+------------------+--------------+-------------+-----------+--------+----------+
| WORD             | FIRST_DOC_ID | LAST_DOC_ID | DOC_COUNT | DOC_ID | POSITION |
+------------------+--------------+-------------+-----------+--------+----------+
| country          |          149 |         787 |        28 |    733 |      265 |
| country          |          149 |         787 |        28 |    733 |     1342 |
| countrydistricts |          733 |         733 |         1 |    733 |      816 |
| thecountry       |          249 |         733 |         2 |    733 |      750 |
+------------------+--------------+-------------+-----------+--------+----------+
4 rows in set (0,08 sec)

(ftslab) > select *
          from information_schema.INNODB_FT_INDEX_TABLE
          WHERE DOC_ID = 155 AND lower(WORD) like '%country%';
+---------+--------------+-------------+-----------+--------+----------+
| WORD    | FIRST_DOC_ID | LAST_DOC_ID | DOC_COUNT | DOC_ID | POSITION |
+---------+--------------+-------------+-----------+--------+----------+
| country |          149 |         787 |        28 |    155 |       31 |
| country |          149 |         787 |        28 |    155 |      495 |
| country |          149 |         787 |        28 |    155 |      158 |
| country |          149 |         787 |        28 |    155 |      525 |
+---------+--------------+-------------+-----------+--------+----------+
4 rows in set (0,09 sec)

```

> En el ejemplo mostrado antes no hay intención de comparar puntuaciones de rank ya que están basadas en algoritmos diferentes.
> La idea allí es mostrar que QUERY EXPANSION puede tener resultados no deseados en algunos casos debido a su mecanismo.

### Avanzando en elegir stop words

El [artículo](https://en.wikipedia.org/wiki/Zipf's_law) completo es increíblemente interesante. En resumen, dice que
la palabra más frecuente ocurrirá aproximadamente el doble de veces que la segunda palabra más frecuente, tres veces más
a menudo que la tercera palabra más frecuente, y así sucesivamente (la distribución de frecuencia de rank es una relación inversa).

La idea aquí es medir cuánto índice ahorramos cortando esas palabras que son extremadamente frecuentes y no agregan
un significado necesario a la búsqueda.



## Consideraciones y recomendaciones


- Usa QUERY EXPANSION solo si estás interesado en buscar relaciones sobre coincidencias exactas. Recuerda que el tamaño del campo
  es crucial al usar esto.
- FTS no es el mejor ajuste para coincidencias exactas de strings en columnas únicas. No querrás usar FTS para buscar emails en
  una sola columna, campos de nombre y apellido, p.ej. Para esos, probablemente usarás otras técnicas como búsquedas inversas o
  operador de coincidencia exacta (=).
- Mantén tus índices FTS cortos. No agregues TODAS las columnas de texto. Parsea primero desde tu aplicación la búsqueda del usuario y
  adapta la consulta.
- Si estás usando BOOLEAN MODE, puedes usar la puntuación de rank para filtrar filas. MySQL es lo suficientemente inteligente para optimizar las
  funciones FTS para evitar ejecuciones dobles. Puedes hacer esto usando algo como:
  `match(content,title) against ("first (<second >third)") > 1 `
  Generalmente, puntuaciones menores que 1 pueden ignorarse cuando se usan búsquedas en modo booleano o natural.
- `OPTIMIZE TABLE` hace un rebuild de la tabla. Para evitar esto, configura `innodb_optimize_fulltext_only=1` para hacer un mantenimiento
  incremental en la tabla.
- Recuerda que NATURAL LANGUAGE MODE no toma los operandos como BOOLEAN MODE. Esto afecta la puntuación de rank (prueba __+bad (<feeling >thing)__ p.ej.)
- Si planeas ordenar por rank, no es necesario especificar la cláusula `ORDER BY` ya que InnoDB hace el orden después de recuperar los doc ids . También, el comportamiento es diferente del predeterminado ya que devuelve los más pesados en la parte superior (como un __ORDER BY rank DESC__).
- Si vienes de la implementación FTS de MyISAM, recuerda que la puntuación de rank es diferente.
- Crea el índice FULLTEXT después de que los datos se carguen [InnoDB bulk load](http://dev.mysql.com/doc/refman/5.7/en/optimizing-innodb-bulk-data-loading.html). Al restaurar backups FTS, probablemente encontrarás el "ERROR 182 (HY000) at line nn: Invalid InnoDB FTS Doc ID".
- Intenta evitar usar más de una expresión FTS en la cláusula where. Ten en cuenta que esto afecta el orden en los resultados y
  consume una cantidad considerable de CPU. InnoDB ordena por la última expresión en la cláusula WHERE. [WL#7123](https://dev.mysql.com/worklog/task/?id=7123)
- También, si evitas la información de rank en la proyección (cláusula SELECT) y usas otras agregaciones como `count(*)`, usará
  los hints FT "no ranking". El hint `limit` no se usará si se invoca explícitamente un `ORDER BY` y la cláusula `MATCH` en la proyección.

```sql
explain  select  *
                      from bookContentByLine
                      where match(content) against ("+home" IN BOOLEAN MODE)
                      ORDER BY FTS_DOC_ID  
                      LIMIT 10\G
  select_type: SIMPLE
        table: bookContentByLine
         type: fulltext
        Extra: Using where; Ft_hints: no_ranking; Using filesort

explain  select  *
                      from bookContentByLine
                      where match(content) against ("+home" IN BOOLEAN MODE)
                      LIMIT 10\G
        table: bookContentByLine
         type: fulltext
        Extra: Using where; Ft_hints: no_ranking, limit = 10

explain  select  count(content)
                    from bookContentByLine
                    where match(content) against ("+home" IN BOOLEAN MODE) \G
        table: bookContentByLine
         type: fulltext
        Extra: Using where; Ft_hints: no_ranking

```

- Si planeas usar la columna `FTS_DOC_ID` con la opción `AUTO_INCREMENT`,
  ten en cuenta que hay una limitación respecto a esto. Debes declarar
  una restricción PRIMARY KEY de columna única o como índice UNIQUE. También, el tipo de datos
  está restringido como `bigint unsigned`. p.ej:

```sql
CREATE TABLE test ( FTS_DOC_ID bigint unsigned  AUTO_INCREMENT,
                    mainPk bigint, other text,
                    PRIMARY KEY(mainPk),
                    UNIQUE(FTS_DOC_ID)
                    );
```


### FT_QUERY_EXPANSION_LIMIT

Esta variable controla el número de coincidencias principales cuando se usa `WITH QUERY EXPANSION` (afecta solo MyISAM).

[referencia](http://dev.mysql.com/doc/refman/5.7/en/server-system-variables.html#sysvar_ft_query_expansion_limit)


### Bug 80347 - Invalid InnoDB FTS Doc ID

> Enviado https://bugs.mysql.com/bug.php?id=80347


```bash
emanuel@3laptop ~/sandboxes/rsandbox_5_7_9 $ ./m dumpTest < full.dump
ERROR 182 (HY000) at line 73: Invalid InnoDB FTS Doc ID

emanuel@3laptop ~/sandboxes/rsandbox_5_7_9 $ ./m dumpTest < ddl.dump
emanuel@3laptop ~/sandboxes/rsandbox_5_7_9 $ ./m dumpTest < onlyData.dump
emanuel@3laptop ~/sandboxes/rsandbox_5_7_9 $ ./m dumpTest < full.dump
ERROR 182 (HY000) at line 73: Invalid InnoDB FTS Doc ID
```

mysqldump no es muy inteligente si usas `FTS_DOC_ID`:

```
2016-02-13T22:11:53.125300Z 19 [ERROR] InnoDB: Doc ID 10002 is too big. Its difference with largest used Doc ID 1 cannot exceed or equal to 10000
```

Toma dumps sin considerar la restricción codificada en
`innobase/row/row0mysql.cc`:

```
Las diferencias entre Doc IDs están restringidas dentro de
un entero de 4 bytes. Ver fts_get_encoded_len()
```

La corrección para esto es hacer backup de la tabla por chunks de 10000 documentos.


### Fine tuning

[Fine tuning](https://dev.mysql.com/doc/refman/5.7/en/fulltext-fine-tuning.html)
[Rendimiento](https://blogs.oracle.com/mysqlinnodb/entry/innodb_full_text_search_performance)

### Características introducidas

### Mantenimiento

[innodb_optimize_fulltext_only](https://dev.mysql.com/doc/refman/5.7/en/innodb-parameters.html#sysvar_innodb_optimize_fulltext_only)

### Internos de parsers

[Escribiendo plugins parser FTS](https://dev.mysql.com/doc/refman/5.7/en/writing-full-text-plugins.html)

## Versión

Este documento R Markdown está hecho interactivo usando Shiny. A diferencia del flujo de trabajo más tradicional
de crear reportes estáticos, ahora puedes crear documentos que permiten a tus
lectores cambiar las suposiciones subyacentes a tu análisis y ver los resultados inmediatamente.  
Para aprender más, ver [Documentos Interactivos](http://rmarkdown.rstudio.com/authoring_shiny.html).

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

