---
title: "Backups Online sin archivos en PGBackRest"
subtitle: "Reduciendo costos de almacenamiento evitando el almacenamiento de archivos"
date: 2025-09-28
author: "3manuek"
draft: false
series: "Postgres"
tags:
  - Postgres
  - PGBackRest
---



Aunque no está documentado en la documentación oficial, es posible evitar almacenar archivos en configuraciones de PGBackRest. En ciertos escenarios, puedes querer ignorar el almacenamiento de archivos para reducir costos, especialmente si estás usando almacenamiento en la nube para tus backups.

Esas situaciones podrían ser:

- Entornos de pruebas, ya sea que ejecutes pruebas intensivas pero no necesitas o te importa PITR (Point in Time Recovery).
- Bases de datos Postgres altamente actualizadas, donde puedes recuperar cambios por otros medios, como scraping o restaurando desde fuentes externas.


{{< notice "warning">}}
- No almacenar archivos puede llevarte a `pérdida de datos` si no tienes una estrategia adecuada para manejar los deltas.
- Todavía necesitas almacenar archivos _durante la ejecución del backup_ si quieres backups _online_. De lo contrario, no serán recuperables.
- Si no quieres almacenar archivos en absoluto, necesitas ejecutar el backup `offline`. Es decir, deteniendo tu instancia y ejecutando `pgbackrest backup`.
{{< /notice >}}


## Configuration

Configuración en tu `postgresql.conf`:

```bash
archive_mode=on
archive_command='test -f /tmp/pgbackrest/<STANZA>-backup.lock || exit 0 && pgbackrest --stanza=<STANZA> archive-push %p'
```

En tu comando `pgbackrest`, necesitas agregar la opción `--archive-check=n`:

```bash
    OPTION="full" # or "incr"

    pgbackrest --stanza=<STANZA> --type="${OPTION}" backup \
        --archive-check=n \
        --archive-timeout=1d --log-level-console=info \
        --buffer-size '16MiB' \
        --no-resume # optional
```


## How this works?

La opción `--archive-check=n` evita la verificación previa del estado del archivo. Esto hace que el comando no falle si los archivos no se están almacenando.

El `archive_command` mostrado arriba, solo almacenará archivos _si el backup está ejecutándose_, verificando si existe el archivo de bloqueo de pgbackrest.

## Ups, I wan't archives now

Si quieres volver a habilitar los archivos, necesitas ejecutar un backup completo después de cambiar tu `archive_command`, de lo contrario, esos archivos almacenados serían inútiles para PITR.


## References

Aquí, puedes explorar los hilos originales sobre este tema:

- [Hilo Original](https://github.com/pgbackrest/pgbackrest/issues/1031)
- [Comentario de `sean0101n`](https://github.com/pgbackrest/pgbackrest/issues/900#issuecomment-580910343)


