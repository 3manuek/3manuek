---
title: "Stream XtraBackup tricks for speeding up backup transfers"
subtitle: "Multiple locations with Bash, xbstream, piping, compression with multi-cores and tee"
date: 2016-04-01
draft: false
tags:
  - Bash
  - MySQL
  - XtraBackup
---

## Problem description

Some systems have a bug that makes xbstream fail to create the destination directory, you need to force its creation.
This is the reason, that in this post, I'll be adding extra steps prior to open the `xbstream` process.

```bash
xtrabackup_56: Error writing file 'UNOPENED' (Errcode: 32 - Broken pipe)
xb_stream_write_data() failed.
```

> Update: it's been long time since new versions haven't been tested by me, so this bug might be fixed as of now.

## Compressing and uncompressing to overcome slow networks

In the following example, we're going to workaround this bug, stream the backup, uncompress, and apply the binary logs events.
If you happen to have plenty of cores, you might prefer to compress and uncompress aggressively, especially if yor network transfer
isn't so fast.

```bash
innobackupex --parallel 50 --slave-info \
--ibbackup=/usr/bin/xtrabackup --tmpdir=/srv/ --stream=xbstream /srv/  \
| pigz | ssh host.com "(cd /srv/mysql; gzip -dc | xbstream -x)”
```

Using `xbstream` would be something like this:

```bash
innobackupex --no-lock --slave-info --socket=/data/mysql/mysql.sock \
--stream=xbstream --safe-slave-backup  --tmpdir=/data/temp --user= \
--password="<password>" --parallel=4 ./ | pigz | \
ssh host.com "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; gzip -dc \
    | xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql && chown -R mysql: /data/mysql"
```


## Streaming to more than one host

Streaming the same backup to 2 different is possible, and the trick can be done this way:

```bash
time innobackupex --no-lock --slave-info --socket=/data/mysql/mysql.sock \
--stream=xbstream --safe-slave-backup  --tmpdir=/data/temp --user=myuser \
--password="<password>" --parallel=4 ./ | \
tee >(ssh root@host1 "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql") \
>(ssh root@host2 "(mkdir /data/mysql 2> /dev/null; cd /data/mysql; xbstream -x /data/mysql; chown -R mysql: /data/mysql) \
    && innobackupex --apply-log /data/mysql && chown -R mysql: /data/mysql ") > /dev/null
```

With an anomyzed user:

```bash
innobackupex --no-lock --slave-info \
--tmpdir=/tmp/xtra --stream=xbstream --safe-slave-backup  --parallel=4 ./ \
| tee >(ssh host1.com "(mkdir /var/lib/mysql/data/ 2> /dev/null; cd /var/lib/mysql/data/; xbstream -x /var/lib/mysql/data/ ) \
        && innobackupex --apply-log /var/lib/mysql/data/") \
>(ssh host2.com "(mkdir /var/lib/mysql/data/ 2> /dev/null; cd /var/lib/mysql/data/; xbstream -x /var/lib/mysql/data/ ) \
        && innobackupex --apply-log /var/lib/mysql/data/ ") > /dev/null
```




