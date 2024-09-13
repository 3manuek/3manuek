---
title: "Using tds_fdw to access BabelfishPG"
subtitle: "Querying BabelfishPG/MSSQL Server from Postgres"
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



## It supports TDS, right?

Some things happen once in a lifetime, and the story around this is quite particular.
A customer required something that at the beginning sound counter intuitive: migrate an existing Postgres database to BabelfishPG.

The thing was that the application was a critical business core, with a large amount of code that would require years to migrate fully for supporting another storage strategy. But the real reason was that their customer didn't want to stick to any private licensing model, and required to use Open Source solutions.

Babelfish was their first option, WiltonDB was considered too. But, considering Babelfish a Postgres flavor -- as it does implement protocol hooks at engine level --, it would be reckless to stick to a flavor fork considering that releases are more frequent than upstream Postgres.

So, as a professional, I asked continuously the corresponding questions:

![areyousure](/images/tdsfdw/rusure.gif)

The whole concept of Babelfish is to allow a large portion of the MSSQL applications to run under an Open Source license. You may be wondering about the performance impact on doing double-parsing, however 

I won't discuss if Babelfish is good or bad, but there where a few considerations on top of the Postgres standard maintanability:

- Upgrades require some extra steps, whenever the engine and extension version is upgraded.
- Pool solutions are quite limited in the Open Source field, for leveraging connections through the TDS backend. I covered this in [TDSPool with BabelfishPG](/posts/2024-08/tdsbabelfish).
- Some performance degradation is expected as it applies a double-parting of the statements.
- The dump of data has some additions on top of the vanilla Postgres. Not quite well documented, but it seems it's related to a heavy rewrite of the pg_dump utility at the core.
- TSQL support is limited, and you need to asess your migration through Babelfish Compass tool, to adapt the necessary pieces. 

Other than that, BabelfishPG is a Postgres. So, storage, replication, and configuration remains the same.


## Migration from Postgres to BabelfishPG (or MSSQL Server to Postgres)

As we said, Babelfish stores data in Postgres data types. How Babelfish maps those data types is a topic by itself.

The most common case would be to insert the data directly to the Postgres tables:

- A FDW from a remote Postgres to the Postgres database which has the Babelfish database initialized.
- Transform the data via queries in the remote, and insert into Postgres tables that were defined previously in Babelfish.

As I said, this case is atypical, as we are moving out Postgres to MSSQL Server. Although, it could be possible that you have the same reasons about licensing and want to migrate MSSQL Server to Babelfish.

Fortunately, there is an extension that provides a Foreign Data Wrapper that supports TDS: [tds_fdw](https://github.com/tds-fdw/tds_fdw).

If the case is that you want to migrate from a MSSQL Server to BabelfishPG, the process would be;

- Once you initilized Babelfish with the structure, create the `tdf_fdw` extension, define the foreign tables.
- Through queries, extract data from the remote and insert in the Postgres tables.


## Using tds_fdw against BabelfishPG

The following steps work in non-initialized databases, that is, outside the BabelfishPG database. For supporting `tds_fdw` in Babelfish +4, you need to compile `babelfishpg_tsql` extension as stated in the package installation instructions:

```bash
PG_CPPFLAGS='-I/usr/include -DENABLE_TDS_LIB' SHLIB_LINK='-lsybdb -L/usr/lib64' make
PG_CPPFLAGS='-I/usr/include -DENABLE_TDS_LIB' SHLIB_LINK='-lsybdb -L/usr/lib64' make install
```


| ⚠️ | More information about building and installing the extension can be found [at this link](https://github.com/tds-fdw/tds_fdw/blob/master/README.md). The linked servers feature is supported using the FreeTDS library which is licensed under the GNU LGPL license. See [COPYING_LIB.txt](https://github.com/FreeTDS/freetds/blob/master/COPYING_LIB.txt) for details. |
|---|:---|

Although it would be faster inserting data directly to Postgres, it is also possible to do so through the TDS protocol. 

You can use this FDW bidirectionally (as most of the FDW out there):

- Bring data from TDS to Postgres.
- Send data from Postgres to TDS.
- Implement Postgres views using `query` in the FDW against either a MSSQL Server or BabelfishPG.

In this case, I'll stick to the scenario of moving data from Postgres to BabelfishPG, although we migrated data using vanilla FDW.


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




Fortunately, `tds_fdw` relies heavily on `FreeTDS`, so you'll need to install the proper dependencies:

```bash
sudo apt install freetds-common freetds-dev freetds-bin
``` 

The connection configuration for `tds_fdw` resides in the `freetds.conf`:

```ini
[global]
  tds version = 7.4 
  dump file = /var/log/tdspool.log 
[babelfish]
  host = localhost
  port = 1433
  database = master ; you can stick to a single database if you don't switch between schemas
```

> Babelfish won't support `tds version = auto`, use this specific version.

Installing the extension is properly documented at [Installing in Ubuntu](https://github.com/tds-fdw/tds_fdw/blob/master/InstallUbuntu.md).

```bash
export TDS_FDW_VERSION="2.0.3"
wget https://github.com/tds-fdw/tds_fdw/archive/v${TDS_FDW_VERSION}.tar.gz
tar -xvzf v${TDS_FDW_VERSION}.tar.gz
cd tds_fdw-${TDS_FDW_VERSION}/
make PG_CONFIG=/opt/babelfish/4.1.0/bin/pg_config USE_PGXS=1
sudo make PG_CONFIG=/opt/babelfish/4.1.0/bin/pg_config USE_PGXS=1 install
```

Once you connect to the database:

```sql
CREATE EXTENSION tds_fdw;
```

Now, the following step will require to create the SERVER. We'll use the `babelfish` label in the server name, as stated in the `freetds.conf` above. More documentation at [Foreign Server](https://github.com/tds-fdw/tds_fdw/blob/master/ForeignServerCreation.md).

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

Now, we create the Foreign Table in the Postgres database to point to the corresponding Server:

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

Documentation at[Foreign Tables](https://github.com/tds-fdw/tds_fdw/blob/master/ForeignTableCreation.md).
We'll cover data type conversions in another post.


Now, data can be transformed and inserted with just a standard query:

```sql
INSERT INTO tbl_employee_remote 
    SELECT ... FROM tbl_employee ...
```

## Incompatibilities

```sql
IMPORT FOREIGN SCHEMA externalTDS
FROM SERVER babelfish
INTO extenalTDSSchema
OPTIONS (import_default 'true');
```

The above statement doesn't work in BabelfishPG due to missing system views when extracting the schema.


Thanks for reading!
