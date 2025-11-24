---
title: "Conectando Postgres y Kafka crudamente"
subtitle: "La forma sucia usando kafkacat plano"
excerpt: ""
date: 2017-02-28
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Kafka
  - Postgres
---

![Apache Kafka](/images/posts/apache-kafka-header.png)

## Apache Kafka y Postgres: Capacidades de transacción y reportes


[Apache Kafka][5] es una plataforma de streaming distribuida bien conocida para procesamiento de datos
y mensajería consistente. Te permite centralizar consistentemente streams de datos para
varios propósitos consumiéndolos y produciéndolos. 

Uno de los ejemplos de una buena implementación, es la [implementación del pipeline de datos de Mozilla][6],
particularmente ya que muestra Kafka como un punto de entrada del flujo de datos. Esto te permite conectar
nuevos almacenes de datos debajo de su stream, facilitando el uso de diferentes formatos de almacenamiento de datos (
como DRBMS o Document, etc. ) para recuperar y escribir datos eficientemente. 

[Postgres Bottled water][3] es un enfoque diferente que merece una mención. En este
caso, las instancias de Postgres son los productores, los brokers consumen los streams y mantienen el almacén de mensajes
disponible para cualquier acción. La ventaja aquí son las bien conocidas capacidades ACID de Postgres
, combinadas con características SQL avanzadas. Este proyecto es una extensión,
lo que significa que es posible usar nuevas características próximas de Postgres fácilmente portables.

También es posible, consumir y producir datos a un broker usando una nueva característica
que extendió la herramienta COPY para ejecutar comandos shell para operaciones de entrada/salida.
Un buen resaltado de esta característica se puede leer [aquí][7].

![kafka](/images/posts/2017-02/kafka.jpg)

<!-- <img name="go2shell-finder" src="/images/blog/2017-02/kafka.jpg" width='300px'/> -->


## kafkacat y librdkafka

[kafkacat][1] es una herramienta basada en la biblioteca del mismo autor [librdkafka][2] que
hace exactamente lo que dice su nombre: producir y consumir de un broker Kafka como el comando `cat`
.


## Produciendo al broker Kafka

Produciendo datos falsos al broker Kafka, compuestos por `key` y `payload`:

```bash
# Random text
randtext() {cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1}
while (true) ;
  do
    for i in $(seq 1 50)  
      do echo "$(uuidgen);$(randtext)"
     done  | kafkacat -P -b localhost:9092 -qe -K ';' -t PGSHARD
     sleep 10
  done
```

La opción `-K` define el delimitador entre la _key_ y el _payload_, `-t` define
el topic para el que quieres producir. Originalmente, este topic ha sido creado con 3
particiones (0-2), lo que nos permitirá consumir datos en diferentes canales, abriendo
la puerta para paralelización.  

Las _Keys_ no son obligatorias al producir a un broker, y en realidad para ciertas soluciones
puedes omitirlas.

## Consumiendo y Produciendo dentro de una instancia Postgres

La sintaxis general será algo cercano a:

```sql
COPY main(group_id,payload)
  FROM PROGRAM
  'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o beginning  -p 0 | awk ''{print "P0\t" $0 }'' ';
```

El código haciendo piping a un `awk` no es estrictamente necesario y es solo para mostrar la
flexibilidad de la característica. Cuando usas la opción `-J`, la salida se imprimirá
en formato json, conteniendo toda la información del mensaje, incluyendo partición, key y
mensaje.

La opción `-c` limitará la cantidad de filas en la operación. Como COPY es transaccional,
ten en cuenta que cuanto mayor sea la cantidad de filas, mayor será la transacción y
los tiempos de COMMIT se verán afectados.


### Consumiendo topics incrementalmente


Consumiendo las particiones del topic desde el `beginning` y estableciendo un límite de `100`
documentos es fácil como:

```bash
bin/psql -p7777 -Upostgres master <<EOF
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o beginning  -p 0 | awk ''{print "P0\t" \$0 }'' ';
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o beginning  -p 1 | awk ''{print "P1\t" \$0 }'' ';
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o beginning  -p 2 | awk ''{print "P2\t" \$0 }'' ';
EOF
```

Y luego usando `stored`, para consumir desde el último offset consumido por el
consumidor en el grupo:

```bash
bin/psql -p7777 -Upostgres master <<EOF
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o stored  -p 0 | awk ''{print "P0\t" \$0 }'' ';
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o stored  -p 1 | awk ''{print "P1\t" \$0 }'' ';
COPY main(group_id,payload) FROM PROGRAM 'kafkacat -C -b localhost:9092 -c100 -qeJ -t PGSHARD  -X group.id=1  -o stored  -p 2 | awk ''{print "P2\t" \$0 }'' ';
EOF
```

Cada línea COPY, puede ejecutarse en paralelo en diferentes instancias Postgres, haciendo
este enfoque flexible y fácilmente escalable a través de un conjunto de servidores.

Esto no es completamente consistente, ya que una vez que el offset es consumido, será marcado
en el broker, ya sea si la transacción falla en el lado de Postgres puede potencialmente llevar
a datos faltantes.


### Produciendo mensajes fuera de las instancias Postgres

De la misma manera es posible consumir cambios, es posible hacer lo mismo para producir
datos al broker. Esto puede ser increíblemente útil para micro agregaciones, hechas sobre los
datos crudos consumidos del broker.

El ejemplo siguiente muestra cómo ejecutar una consulta simple con una agregación muy simplista
y publicarla en formato JSON al broker:


```sql
master=# COPY (select row_to_json(row(now() ,group_id , count(*))) from main group by group_id)
         TO PROGRAM 'kafkacat -P -b localhost:9092 -qe  -t AGGREGATIONS';
COPY 3
```

Si tienes una granja de servidores y quieres buscar el contenido del topic usando una key,
puedes hacer el siguiente ajuste:

```sql
COPY (select inet_server_addr() || ';', row_to_json(row(now() ,group_id , count(*))) from main group by group_id)
   TO PROGRAM 'kafkacat -P -K '';'' -b localhost:9092 -qe  -t AGGREGATIONS';
```


Así es como se ven los payloads publicados (sin _key_):

```bash
➜  PG10 kafkacat -C -b localhost:9092 -qeJ -t AGGREGATIONS -X group.id=1  -o beginning
{"topic":"AGGREGATIONS","partition":0,"offset":0,"key":"","payload":"{\"f1\":\"2017-02-24T12:34:13.711732-03:00\",\"f2\":\"P1\",\"f3\":172}"}
{"topic":"AGGREGATIONS","partition":0,"offset":1,"key":"","payload":"{\"f1\":\"2017-02-24T12:34:13.711732-03:00\",\"f2\":\"P0\",\"f3\":140}"}
{"topic":"AGGREGATIONS","partition":0,"offset":2,"key":"","payload":"{\"f1\":\"2017-02-24T12:34:13.711732-03:00\",\"f2\":\"P2\",\"f3\":155}"}
```

... y con _key_:

```json
{"topic":"AGGREGATIONS","partition":0,"offset":3,"key":"127.0.0.1/32","payload":"\t{\"f1\":\"2017-02-24T12:40:39.017644-03:00\",\"f2\":\"P1\",\"f3\":733}"}
{"topic":"AGGREGATIONS","partition":0,"offset":4,"key":"127.0.0.1/32","payload":"\t{\"f1\":\"2017-02-24T12:40:39.017644-03:00\",\"f2\":\"P0\",\"f3\":994}"}
{"topic":"AGGREGATIONS","partition":0,"offset":5,"key":"127.0.0.1/32","payload":"\t{\"f1\":\"2017-02-24T12:40:39.017644-03:00\",\"f2\":\"P2\",\"f3\":716}"}
```


## Manipulación básica de topics

Si eres nuevo en Kafka, encontrarás útil contar con algunos ejemplos de comandos
para jugar con tu broker local.

Iniciando todo:

```bash
bin/zookeeper-server-start.sh config/zookeeper.properties 2> zookeper.log &
bin/kafka-server-start.sh config/server.properties 2> kafka.log &
```

Creando topics y otros:

```bash
bin/kafka-topics.sh --list --zookeeper localhost:2181
bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 3 --topic PGSHARD
bin/kafka-topics.sh --delete  --zookeeper localhost:2181 --topic PGSHARD
bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic AGGREGATIONS
bin/kafka-topics.sh --delete  --zookeeper localhost:2181 --topic AGGREGATIONS
```

> NOTA: Para eliminar topics, necesitas habilitar `delete.topic.enable=true` en
> el archivo server.properties.


¡Espero que encuentres esto útil!



[1]: https://github.com/edenhill/kafkacat
[2]: https://github.com/edenhill/librdkafka
[3]: https://www.confluent.io/blog/bottled-water-real-time-integration-of-postgresql-and-kafka/

[5]: https://kafka.apache.org/
[6]: https://robertovitillo.com/2017/01/23/an-overview-of-mozillas-data-pipeline/
[7]: http://paquier.xyz/postgresql-2/postgres-9-6-feature-highlight-copy-dml-statements/
<!-- [9]: http://www.3manuek.com/assets/posts/kafka.jpg -->

