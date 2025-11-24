---
title: "Trucos de Stream XtraBackup para acelerar transferencias de backup"
subtitle: "Múltiples ubicaciones con Bash, xbstream, piping, compresión con multi-cores y tee"
date: 2016-04-01
draft: false
tags:
  - Bash
  - MySQL
  - XtraBackup
---

## Descripción del problema

Algunos sistemas tienen un bug que hace que xbstream falle al crear el directorio de destino, necesitas forzar su creación.
Esta es la razón, que en este post, agregaré pasos adicionales antes de abrir el proceso `xbstream`.

```bash
xtrabackup_56: Error writing file 'UNOPENED' (Errcode: 32 - Broken pipe)
xb_stream_write_data() failed.
```

> Actualización: ha pasado mucho tiempo desde que las nuevas versiones no han sido probadas por mí, así que este bug podría estar corregido ahora.

## Comprimiendo y descomprimiendo para superar redes lentas

En el siguiente ejemplo, vamos a trabajar alrededor de este bug, hacer stream del backup, descomprimir, y aplicar los eventos de binary logs.
Si tienes muchos cores, podrías preferir comprimir y descomprimir agresivamente, especialmente si tu transferencia de red
no es tan rápida.

```bash
innobackupex --parallel 50 --slave-info \
--ibbackup=/usr/bin/xtrabackup --tmpdir=/srv/ --stream=xbstream /srv/  \
| pigz | ssh host.com "(cd /srv/mysql; gzip -dc | xbstream -x)"
```

Usando `xbstream` sería algo así:

```bash
innobackupex --no-lock --slave-info --socket=/data/mysql/mysql.sock \
--stream=xbstream --safe-slave-backup  --tmpdir=/data/temp --user= \
--password="<password>" --parallel=4 ./ | pigz | \
ssh host.com "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; gzip -dc \
    | xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql && chown -R mysql: /data/mysql"
```


## Haciendo stream a más de un host

Hacer stream del mismo backup a 2 hosts diferentes es posible, y el truco se puede hacer de esta manera:

```bash
time innobackupex --no-lock --slave-info --socket=/data/mysql/mysql.sock \
--stream=xbstream --safe-slave-backup  --tmpdir=/data/temp --user=myuser \
--password="<password>" --parallel=4 ./ | \
tee >(ssh root@host1 "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql") \
>(ssh root@host2 "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql && chown -R mysql: /data/mysql ") > /dev/null
```

Con un usuario anonimizado:

```bash
innobackupex --no-lock --slave-info \
--tmpdir=/tmp/xtra --stream=xbstream --safe-slave-backup  --parallel=4 ./ \
| tee >(ssh host1.com "(mkdir /var/lib/mysql/data/ 2> /dev/null; cd /var/lib/mysql/data/; xbstream -x /var/lib/mysql/data/ ) \
        && innobackupex --apply-log /var/lib/mysql/data/") \
>(ssh host2.com "(mkdir /var/lib/mysql/data/ 2> /dev/null; cd /var/lib/mysql/data/; xbstream -x /var/lib/mysql/data/ ) \
        && innobackupex --apply-log /var/lib/mysql/data/ ") > /dev/null
```




