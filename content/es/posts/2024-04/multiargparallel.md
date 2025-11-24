---
title: "Usando parallel con múltiples argumentos"
subtitle: "Pasando múltiples argumentos en JSON a parallel"
date: 2024-04-01
author: "3manuek"
draft: false
series: "Bash"
tags:
  - Bash
  - Parallel
---


## Una herramienta útil para paralelización

Si estás leyendo este post, es porque has oído sobre `parallel`. Es una herramienta desarrollada por GNU para 
paralelizar comandos a través de conjuntos de argumentos. Seré honesto, suelo olvidar su existencia hasta
que necesito hacer cosas rápidas y sucias cuando trato con tareas que requieren paralelización, y siempre que el tiempo
es una restricción.

Tiene muchas opciones y argumentos, aunque una vez que te acostumbras a su uso, es muy útil en muchos 
casos.

## Mi caso

Uno de los proyectos en los que he estado trabajando recientemente involucra construir imágenes OCI basadas en componentes distroless. 
El número de imágenes generadas es bastante alto, con alrededor de 4,000 imágenes empujadas hasta la fecha. Estas deberían considerarse 
capas en lugar de imágenes independientes, ya que forman una cadena de dependencia para crear una imagen funcional final.

El desafío era verificar la información de la imagen vía la API de GitHub. Para abordar esto, construí un script que recorría todos 
los contenedores existentes (el término que GitHub usa para imágenes) a través de varias páginas.

Mi enfoque inicial era directo: extraer el nombre e ID de cada imagen, analizar los datos, realizar sustitución de variables,
y luego hacer scraping y almacenar la información de la imagen. Sin embargo, todo el proceso estaba tomando **12 minutos** para completarse, 
lo cual era claramente ineficiente e inaceptable. 

En el pasado, había usado procesamiento paralelo, pero esta situación era diferente ya que los argumentos no eran 
combinaciones sino filas individuales de información para cada versión de imagen.

Usar procesamiento paralelo en este caso redujo el tiempo de ejecución completo a alrededor de **6 minutos**, incluso con un 
límite de solo cuatro trabajos concurrentes para evitar superar las restricciones de cuota de la API.


## Abordando el problema: pasando parámetros en JSON a parallel

El siguiente fragmento es parte de una función llamada `index_container_pages` que produce los parámetros en un 
formato JSON, con la información necesaria para hacer scraping del ID de imagen desde la API.

```bash
  jq -r  '.[] | {id: .id , name: .name , url: .url} | @json' \
    $(get_container_pages) > ${OUTDIR}/paramix.json
```

El `get_container_pages` es una función que solo devuelve todas las páginas previamente descargadas del registro. Considera
que estamos hablando de alrededor de 4,000 imágenes (contenedores, como se conocen en Github), así que esto está devolviendo alrededor de +30 páginas de 
archivos JSON. Dentro del comando anterior, pude combinarlos todos en el archivo JSON que sirve como 
parámetros para el comando `parallel`.

Este archivo generado es la lista de argumentos que vamos a usar para parametrizar `parallel`.

El código dentro del script, terminó viéndose así:


```bash
  HEADER="curl -s -L -H \"Accept: application/vnd.github+json\" \
        -H \"Authorization: Bearer ${GH_TOKEN}\" \
        -H \"X-GitHub-Api-Version: 2022-11-28\""
   
  parallel --progress --colsep '\t' -j4 \
    '[ ! -d '''${OUTDIR}'''/{2} ] && { mkdir -p '''${OUTDIR}'''/{2} ; } ; \
    '''${HEADER}''' \
        {1} > '''${OUTDIR}'''/{2}/{3}.json ; sleep 0.1' \
     :::: <(jq -r '. | "\(.url)\t\(.name)\t\(.id)"' ${OUTDIR}/paramix.json) 

  parallel --progress --colsep '\t' -j4 \
    ''''${HEADER}''' \
        {1}/versions > '''${OUTDIR}'''/{2}/versions.json ; sleep 0.1' \
     :::: <(jq -r '. | "\(.url)\t\(.name)"' ${OUTDIR}/paramix.json) 
```

- HEADER es solo una Macro del comando `curl`.
- Esas variables usando comillas simples triples son esas "constantes", así que las inyectamos directamente en el comando `parallel`.
  - _Sé que se ve raro usar comillas simples triples, pero IMHO es la mejor forma de escapar de comillas en el shell._ Puedes inyectar 
    lo que tengas declarado sin caer en back-slashes molestos y es más consistente.
- El `::::` es el equivalente de `parallel` de `while`, y leemos los parámetros del `paramix.json` en formato TSV. Puedes usar CSV también. En cualquier caso, esto se controla por `--colsep '\t'`.
- El `{1}`, `{2}` y `{3}` son las variables que alimentamos desde el comando `jq`. _Duh._
- El `sleep` no es estrictamente necesario, pero controla mejor el caso en el que la iteración podría considerarse sospechosa.
  - El registro de GH se quejaba cuando intenté emitir el comando sin sleep.
- El `name`, devuelve el nombre de ruta de la imagen, así que usamos ese nombre exacto para crear la ruta local.

Puedes incluso hacer mejor control de la paralelización con el flag `-j` obteniendo el factor de procesamiento que quieres asignar. P. ej.:

```bash
-j $(expr $(nproc) / 2 + 1)
-j $(nproc)
```

Ten en cuenta que hay ciertas limitaciones respecto a la cantidad de solicitudes permitidas a través de cualquier API. Aunque, el ejemplo anterior puede usarse para procesar cosas localmente.



## Otras combinaciones

Los argumentos de parallel pueden básicamente controlarse por `:::`, `:::+` y `::::` (que es el que usamos arriba para tomar argumentos de un archivo). El `:::` solo combina todos los argumentos, mientras que `:::+` fuerza una sola ejecución para cada argumento.

```bash
parallel echo ::: 1 2 3 ::: A B C ::: T
1 A T
1 B T
1 C T
2 A T
2 B T
2 C T
3 A T
3 B T
3 C T
```

Ahora, supongamos que solo quiero las combinaciones para `A B C` solamente, así que puedo usar `:::+` para hacer una sola iteración:

```bash
parallel echo ::: 1 2 3 :::+ A B C ::: T
1 A T
2 B T
3 C T

parallel echo ::: 1 2 3 ::: A B C :::+ T
1 A T
2 A T
3 A T
```

Los argumentos más a la derecha tienen precedencia sobre los argumentos más a la izquierda, así que ten esto en cuenta al construir listas de argumentos.

¡Gracias por leer!

