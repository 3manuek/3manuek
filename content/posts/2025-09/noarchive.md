---
title: "Online Backups with no archives in PGBackRest"
subtitle: "Reducing storage costs by avoiding archive storage"
date: 2025-09-28
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - PGBackRest
---

Even tho is not documented in the official documentation, it is possible to avoid storing archives on PGBackRest setups. In certain scenarios, you may want to disregard storing archives for reducing costs, specially if you are using cloud storage for your backups.

Those situations could be:

- Tests environments, whether you run intensive tests but you don't need or care about PITR (Point in Time Recovery).
- Highly updated Postgres databases, where you can recover changes by other means, such as scrapping or restoring from external sources.


{{< notice "warning">}}
- Not storing archives may lead you to `data loss` if you don't have a proper strategy for handling the deltas.
- You still need to store archives _during backup execution_ if you want _online_ backups. Otherwise, they won't be recoverable.
- If you don't want to store archives at all, you need to run backup `offline`. That is, stopping your instance and executing `pgbackrest backup`.
{{< /notice >}}


## Configuration

Configuration on your `postgresql.conf`:

```bash
archive_mode=on
archive_command='test -f /tmp/pgbackrest/<STANZA>-backup.lock || exit 0 && pgbackrest --stanza=<STANZA> archive-push %p'
```

In your `pgbackrest` command, you need to add the `--archive-check=n` option:

```bash
    OPTION="full" # or "incr"

    pgbackrest --stanza=<STANZA> --type="${OPTION}" backup \
        --archive-check=n \
        --archive-timeout=1d --log-level-console=info \
        --buffer-size '16MiB' \
        --no-resume # optional
```


## How this works?

The `--archive-check=n` option avoids pre-checking the archive status. This makes the command not to fail if archives are not being stored.

The `archive_command` shown above, will only store archives _if backup is running_, checking if the pgbackrest lock file exists.

## Ups, I wan't archives now

If you want to re-enable archives, you need to run a full backup after changing your `archive_command`, otherwise, those stored archives would be useless for PITR.


## References

Here, you can explore the original threads about this topic:

- [Original Thread](https://github.com/pgbackrest/pgbackrest/issues/1031)
- [Comment from `sean0101n`](https://github.com/pgbackrest/pgbackrest/issues/900#issuecomment-580910343)

