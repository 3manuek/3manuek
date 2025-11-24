---
title: "[BabelfishPG] Pooling de conexiones TDS en BabelfishPG con FreeTDS"
subtitle: "Utilidad TDSPool"
date: 2024-08-15
author: "3manuek"
draft: false
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
  - MSSQL
  - Pooling
---

> El siguiente post cubrirá pruebas de rendimiento usando `tdspool`.

## Arquitectura de conexión de BabelfishPG

Heredada de la arquitectura de conexión de Postgres, cada conexión a través del puerto TDS instanciará un backend de Postgres. Como en Postgres, BabelfishPG necesita un middleware para canalizar
conexiones a través del puerto TDS para evitar quedarse sin conexiones y capacidad de procesamiento
en el servidor de base de datos.

Para Postgres, tenemos muchas opciones, como PGBouncer, Odyssey, pgcat, nómbralo. 
Para T-SQL (léase como lenguaje compatible con MSSQL), no hay muchas soluciones de código abierto.

Una de las opciones que exploramos aquí, es del proyecto FreeTDS: [`tdspool`](https://www.freetds.org/userguide/tdspool.html),
parte del paquete `freetds-bin`.

>
> Dos limitaciones _muy_ importantes antes de considerar esto en un entorno productivo al usar `tdspool`:
> 
> - El pool de conexiones FreeTDS actualmente no soporta la versión TDS 5.0 (Sybase) y conexiones encriptadas. ¡Esta restricción aplica tanto a las conexiones cliente-a-pool como pool-a-servidor!
> - No permite ajustar un límite en conexiones frontend.
>

Si eres nuevo alrededor del proyecto BabelfishPG y llegaste aquí por cualquier razón, 
ten en cuenta que hay dos tipos de [arquitecturas de base de datos](https://babelfishpg.org/docs/installation/single-multiple/#single-vs-multiple-instances) establecidas en 
[`babelfish_tsql.migration_mode`](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tsqlmigration_mode): `single-db` y `multi-db`.

Generalmente, la mayoría de los casos puedes querer elegir entre ellas. Aquí está mi opinión personal:

- Si tus bases de datos son pequeñas y necesitas acceder a todas ellas, tal vez `multi-db` es una buena opción.
  Sin embargo, si esto aplica a un entorno de desarrollo, pero en producción esperas que cada una de esas bases de datos
  esté en recursos separados ten en cuenta que el mapeo de usuarios en la instancia Postgres será diferente.
- Quieres tener bases de datos grandes cada una en recursos dedicados, `single-db`. Si este es el caso, y quieres
  tener un entorno de desarrollo, puedes querer apegarse a este modo en lugar de usar `multi-db` para consolidar.



## Pooling con TDSPool (FreeTDS)

Para este ejemplo, vamos a configurar la siguiente arquitectura de pool:

<!-- https://somethingstrange.com/posts/hugo-with-fontawesome/ to integrate fontawesome fa-solid fa-database -->
{{< mermaid >}}
flowchart TD
    A[App] -->|Port 5000| B(fa:fa-filter appdbpool)
    A -->|Port 5001| F(fa:fa-filter appreportpool)
    B -.->|Port 1433 <br/> 5-30 server-side conns| D(fa:fa-database <br/> BabelfishPG)
    F -.->|Port 1433 <br/> 5-30 server-side conns| D
{{< /mermaid >}}


`tdspool` depende de 2 archivos de configuración, [.freetds.conf](https://www.freetds.org/userguide/freetdsconf.html) y [.pool.conf](https://www.freetds.org/userguide/tdspool.html). Por defecto, espera que esos archivos estén en el directorio home del usuario.

{{< tabs tabTotal="2" >}}

{{% tab tabName=".freetds.conf" %}}
```ini
[global]
        tds version = auto 
        dump file = /var/log/tdspool.log 
[babelfish]
        host = localhost
        port = 1433
        database = master
```

>   Babelfish usa 7.4 si se desea especificar la versión.

{{% /tab %}}

{{% tab tabName=".pool.conf" %}}

```ini
[global]
min pool conn = 5
max pool conn = 30
max member age = 120

[appdbpool]
server user = babelfish_admin 
server password = themainuserpassword
server = babelfish
user = appuser
database = appdb
password = apppassoword
max pool conn = 30
port = 5000

[appreportpool]
server user = babelfish_admin 
server password = themainuserpassword
server = babelfish
user = appreport
database = appdbreport
password = apppassoword
max pool conn = 30
port = 5001

```
{{% /tab %}}

{{< /tabs >}}




Además de la configuración de autorización y credenciales, las configuraciones más importantes son:

- `min pool size`: es el número mínimo de conexiones al servidor para mantener abiertas, así menos latencia para esas
  consultas ejecutadas después de un período de inactividad.
- `max pool size`: este valor está vinculado a la capacidad de CPU y la configuración `max_connections` a nivel de Postgres.
- `max member age`: usado para recolectar conexiones basura.

Cuando inicias `tdspool`, necesitas especificar sobre qué pool servirá. El contexto de la base de datos
cambiará si la autorización tiene éxito, ya que el servidor está conectado a `master` en este caso de ejemplo. En producción,
puedes querer aislar el acceso teniendo diferentes configuraciones de servidor con sus propios usuarios y bases de datos.


Iniciando los servicios:

```bash
tdspool -c .pool.conf appdbpool
tdspool -c .pool.conf appreportpool
```


La configuración anterior configurará dos pools para servir las bases de datos `appdb` y `appreport`, con diferentes usuarios.
Esto es, por ejemplo un caso donde hay diferentes cargas de trabajo entre ambas partes de la aplicación (aplicación principal y 
consultas de reportes asíncronos). 

Para conectarse usando `tsql`, que es nuestro cliente disponible en el conjunto de herramientas FreeTDS, necesitamos especificar el
servidor con la opción `-S`:

```bash
tsql -S babelfish -p 5000 -P ${APPDB_PASS} -D appdb -U appuser
```

¡Gracias por leer, mantente atento para el siguiente post!

