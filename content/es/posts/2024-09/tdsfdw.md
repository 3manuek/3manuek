---
title: "[BabelfishPG] Usando tds_fdw para acceder a BabelfishPG"
subtitle: "Consultando BabelfishPG/MSSQL Server desde Postgres"
date: 2024-09-06
author: "3manuek"
draft: false
series: "BabelfishPG"
tags:
  - Postgres
  - BabelfishPG
  - TDS
  - TSQL
  - MSSQL
  - Data Integration
---


## ¿Soporta TDS, verdad?

Algunas cosas pasan una vez en la vida, y la historia alrededor de esto es bastante particular.
Un cliente requirió algo que al principio sonaba contraintuitivo: migrar una base de datos Postgres existente a BabelfishPG.

La cosa era que la aplicación era un núcleo crítico del negocio, con una gran cantidad de código que requeriría años para migrar completamente para soportar otra estrategia de almacenamiento. Pero la razón real era que su cliente no quería apegarse a ningún modelo de licenciamiento privado, y requería usar soluciones Open Source.

Babelfish era su primera opción, WiltonDB también fue considerado. Pero, considerando Babelfish una variante de Postgres -- ya que implementa protocol hooks a nivel de motor --, sería imprudente apegarse a un fork de variante considerando que las releases son más frecuentes que el upstream de Postgres.

Entonces, como profesional, pregunté continuamente las preguntas correspondientes:

![areyousure](/images/tdsfdw/rusure.gif)

Todo el concepto de Babelfish es permitir que una gran porción de las aplicaciones MSSQL se ejecuten bajo una licencia Open Source. Puedes estar preguntándote sobre el impacto en el rendimiento de hacer doble-parsing, pero si esto es un asunto para ti, podrías reconsiderar mantener la compatibilidad TSQL.

Pero si no tienes demasiadas opciones y decides usar BabelfishPG, aquí hay algunas consideraciones además del mantenimiento estándar de Postgres:

- Las actualizaciones requieren algunos pasos adicionales, siempre que se actualice la versión del motor y la extensión.
- Las soluciones de pool son bastante limitadas en el campo Open Source, para aprovechar conexiones a través del backend TDS. Cubrí esto en [TDSPool con BabelfishPG](/posts/2024-08/tdsbabelfish).
- Se espera alguna degradación de rendimiento ya que aplica un doble-parsing de los statements.
- El volcado de datos tiene algunas adiciones además del vanilla Postgres. No está muy bien documentado, pero parece estar relacionado con una reescritura pesada de la utilidad pg_dump en el núcleo.
- El soporte TSQL es limitado, y necesitas evaluar tu migración a través de la herramienta Babelfish Compass, para adaptar las piezas necesarias. 

Aparte de eso, BabelfishPG es un Postgres. Entonces, almacenamiento, replicación y configuración permanecen iguales.


## Migración de Postgres a BabelfishPG (o MSSQL Server a Postgres)

Como dijimos, Babelfish almacena datos en tipos de datos de Postgres. Cómo Babelfish mapea esos tipos de datos es un tema por sí mismo.

El caso más común sería insertar los datos directamente en las tablas de Postgres:

- Un FDW desde un Postgres remoto a la base de datos Postgres que tiene la base de datos Babelfish inicializada.
- Transformar los datos vía consultas en el remoto, e insertar en tablas Postgres que fueron definidas previamente en Babelfish.

Como dije, este caso es atípico, ya que estamos moviendo Postgres a MSSQL Server. Aunque, podría ser posible que tengas las mismas razones sobre licenciamiento y quieras migrar MSSQL Server a Babelfish.

Afortunadamente, hay una extensión que proporciona un Foreign Data Wrapper que soporta TDS: [tds_fdw](https://github.com/tds-fdw/tds_fdw).

Si el caso es que quieres migrar desde un MSSQL Server a BabelfishPG, el proceso sería;

- Una vez que inicializaste Babelfish con la estructura, crea la extensión `tdf_fdw`, define las tablas foráneas.
- A través de consultas, extrae datos del remoto e inserta en las tablas Postgres.


## Usando tds_fdw contra BabelfishPG

Los siguientes pasos funcionan en bases de datos no inicializadas, es decir, fuera de la base de datos BabelfishPG. Para soportar `tds_fdw` en Babelfish +4, necesitas compilar la extensión `babelfishpg_tsql` como se establece en las instrucciones de instalación del paquete:

```bash
PG_CPPFLAGS='-I/usr/include -DENABLE_TDS_LIB' SHLIB_LINK='-lsybdb -L/usr/lib64' make
PG_CPPFLAGS='-I/usr/include -DENABLE_TDS_LIB' SHLIB_LINK='-lsybdb -L/usr/lib64' make install
```

{{< notice "warning" >}}
Más información sobre construir e instalar la extensión se puede encontrar [en este enlace](https://github.com/tds-fdw/tds_fdw/blob/master/README.md). La característica de servidores vinculados está soportada usando la biblioteca FreeTDS que está licenciada bajo la licencia GNU LGPL. Ver [COPYING_LIB.txt](https://github.com/FreeTDS/freetds/blob/master/COPYING_LIB.txt) para detalles.
{{< /notice >}}


Aunque sería más rápido insertar datos directamente en Postgres, también es posible hacerlo a través del protocolo TDS. 

Puedes usar este FDW bidireccionalmente (como la mayoría de los FDW que hay):

- Traer datos de TDS a Postgres.
- Enviar datos de Postgres a TDS.
- Implementar vistas Postgres usando `query` en el FDW contra un MSSQL Server o BabelfishPG.

En este caso, me apegaré al escenario de mover datos de Postgres a BabelfishPG, aunque migramos datos usando FDW vanilla.


{{< plantuml >}}
actor Client

== Request Initialization ==

box "Postgres Engine" #LightBlue

Client --> Postgres ++ : Request

activate Client


Postgres -> Parse --++ #DarkSalmon: Local Query Parsing

deactivate Parse
Parse -> FDW --++ #LightSalmon: FDW Access

end box

FDW --> MSSQL ++ : TDS Protocol

MSSQL -> MSSQL: Execute query by tds_fdw 

create control CursorIteration
MSSQL --> CursorIteration

deactivate MSSQL
CursorIteration --> FDW: Fetch Cursor


FDW --> Parse
deactivate FDW

Parse -> Postgres: Transform Rows

Postgres -> Postgres: Store Data
Postgres --> Client: ResultSet
deactivate Postgres
deactivate Client

== Request Done ==
{{< /plantuml >}}



Afortunadamente, `tds_fdw` depende mucho de `FreeTDS`, así que necesitarás instalar las dependencias apropiadas:

```bash
sudo apt install freetds-common freetds-dev freetds-bin
``` 

La configuración de conexión para `tds_fdw` reside en el `freetds.conf`:

```ini
[global]
  tds version = 7.4 
  dump file = /var/log/tdspool.log 
[babelfish]
  host = localhost
  port = 1433
  database = master ; puedes apegarse a una sola base de datos si no cambias entre esquemas
```

{{< notice "warning" >}}
BabelfishPG no soporta `tds version = auto`. `7.4` es la versión predeterminada. Ver cómo controlar la versión del protocolo TDS a través de [babelfishpg_tds.tds_default_protocol_version](https://babelfishpg.org/docs/internals/configuration/#babelfishpg_tdstds_default_protocol_version). 
{{< /notice>}}


Instalar la extensión está adecuadamente documentado en [Instalación en Ubuntu](https://github.com/tds-fdw/tds_fdw/blob/master/InstallUbuntu.md).

```bash
export TDS_FDW_VERSION="2.0.3"
wget https://github.com/tds-fdw/tds_fdw/archive/v${TDS_FDW_VERSION}.tar.gz
tar -xvzf v${TDS_FDW_VERSION}.tar.gz
cd tds_fdw-${TDS_FDW_VERSION}/
make PG_CONFIG=/opt/babelfish/4.1.0/bin/pg_config USE_PGXS=1
sudo make PG_CONFIG=/opt/babelfish/4.1.0/bin/pg_config USE_PGXS=1 install
```

Una vez que te conectas a la base de datos:

```sql
CREATE EXTENSION tds_fdw;
```

Ahora, el siguiente paso requerirá crear el SERVIDOR. Usaremos la etiqueta `babelfish` en el nombre del servidor, como se establece en el `freetds.conf` arriba. Más documentación en [Foreign Server](https://github.com/tds-fdw/tds_fdw/blob/master/ForeignServerCreation.md).

```sql
DROP SERVER babelfish CASCADE;

CREATE SERVER babelfish
 FOREIGN DATA WRAPPER tds_fdw
 OPTIONS (servername 'babelfish', port '1433', 
    database 'externalTDS', tds_version '7.4');
```

[User Mapping](https://github.com/tds-fdw/tds_fdw/blob/master/UserMappingCreation.md):

```sql
CREATE USER MAPPING FOR postgres
  SERVER babelfish
  OPTIONS (username 'babelfish_admin', password 'xxx');
```

Ahora, creamos la Foreign Table en la base de datos Postgres para apuntar al Servidor correspondiente:

```sql
CREATE FOREIGN TABLE tbl_employee_remote (
    EMPLOYEE_ID                  uuid,
    TYP_EMPLOYEE_ID              uuid,
    EMPLOYEE_NUMBER              varchar(60),
    EMPLOYEE_DOCUMENT            varchar(40),
    DEP_ID                  uuid,
    EMPLOYEE_STATUS              boolean,
    BAN_ACC_NUMBER          varchar(250),
    EMPLOYEE_CREATEDATE          timestamp,
    EMPLOYEE_START_DATE          timestamp,
    EMPLOYEE_FINAL_DATE          timestamp,
    EMPLOYEE_ADDRESS             varchar(400),
)
SERVER babelfish
OPTIONS ( table_name 'tbl_employee' );
```

Documentación en [Foreign Tables](https://github.com/tds-fdw/tds_fdw/blob/master/ForeignTableCreation.md).
Cubriremos conversiones de tipos de datos en otro post.


Ahora, los datos pueden transformarse e insertarse con solo una consulta estándar:

```sql
INSERT INTO tbl_employee_remote 
    SELECT ... FROM tbl_employee ...
```

## Incompatibilidades

{{< notice "warning" >}}
La siguiente declaración no funciona en BabelfishPG debido a vistas del sistema faltantes al extraer el esquema.
{{< /notice >}}

```sql
IMPORT FOREIGN SCHEMA externalTDS
FROM SERVER babelfish
INTO extenalTDSSchema
OPTIONS (import_default 'true');
```


¡Gracias por leer!

