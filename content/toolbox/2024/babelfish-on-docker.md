---
title: "BabelfishPG loose contributions"
subtitle: "BabelfishPG Docker Images generator, and dummy database."
excerpt: ""
date: 2024-06-30
author: "3manuek"
draft: false

series: "BabelfishPG"
tags:
  - Projects
  - BabelfishPG
  - Postgres
  - Docker
# layout options: single or single-sidebar
layout: single

---

### BabelfishPG Docker files and images


{{< notice "info" >}}
Repository: [babelfish-on-docker](https://github.com/plataform3/babelfish-on-docker).
Original work [at Github](https://github.com/babelfish-for-postgresql/babelfish-for-postgresql/pull/5/files).
{{< /notice>}}

Babelfish for Postgres is a slightly-modified Postgres distribution that provides
extensions for supporting TDS protocol and T-SQL language.

I'm updating the generated images with the latest releases, plus adding a basic
dockerization for the `tdspool` utility, for setting up a pool for the TDS connections.

### BabelfishPG Example Database


{{< notice "info" >}}
[Original work](https://github.com/babelfish-for-postgresql/babelfish-for-postgresql/pull/6/files).
{{< /notice>}}

BabelfishPG provides a limited set of T-SQL, here is an example of a T-SQL compatible 
script:

```sql
if exists (select 1
            from  sysobjects
           where  id = object_id('Users')
            and   type = 'U')
    DROP TABLE ScoreBoard
    DROP TABLE Users
    DROP FUNCTION generate_username
    DROP FUNCTION generate_date
    DROP PROCEDURE generate_random_users
    DROP PROCEDURE generate_random_score
GO



CREATE FUNCTION generate_username ()
RETURNS varchar(40)
AS
BEGIN
    DECLARE @genuser varchar(40)
    DECLARE @length int
    SET @length = CAST(RAND() * 38 as INT)
    SELECT @genuser = ''
    WHILE @length > 0
    BEGIN
        SELECT @genuser = @genuser + CHAR(48 + ABS(CHECKSUM(NEWID())) % 80)
        SET @length = @length - 1
    END
    IF EXISTS ( SELECT username FROM Users WHERE username = @genuser)
        SELECT @genuser = generate_username()
    RETURN @genuser
END
GO


CREATE PROCEDURE generate_random_users
    @scale int
AS 
BEGIN
    WHILE (@scale <> 0)
        BEGIN
        INSERT [Users] (username, balance)
            SELECT generate_username(), CAST(RAND()*100000 AS MONEY)
        SET @scale = @scale - 1
        END
END
GO


CREATE FUNCTION generate_date ()
RETURNS datetime
AS 
BEGIN
    DECLARE @gentime DATETIME
    SET @gentime = GETDATE() + (365 * 2 * RAND() - 365)
    RETURN @gentime
END
GO

CREATE PROCEDURE generate_random_score
    @scale int
AS 
BEGIN
    DECLARE @userpick nvarchar(40)
    DECLARE @randtiny tinyint
    DECLARE @query varchar(4000)
    -- FIXME! Not supported in Babelfish
    -- INSERT [ScoreBoard] (username, points)
    --     SELECT TOP 1 username, CAST(ROUND(RAND()*100) AS tinyint)
    --     FROM Users ORDER BY NEWID()
    -- Msg 33557097 (severity 16, state 1) from BABELFISH Line 1:
    --         "syntax error at or near "TOP""

    -- To over come limitation above, we can use a CTE for inserting rows from a TOP claused query
    set @query = 'WITH randus AS (
        SELECT TOP ' + CAST(@scale as varchar) + 'username, CAST(ROUND(RAND()*100) AS tinyint)
            FROM Users ORDER BY NEWID()   
    ) INSERT INTO [ScoreBoard] (username, points)
    SELECT * FROM randus'

    execute(@query)

END
GO


CREATE TABLE Users (
    Id          int IDENTITY,
    username    nvarchar(40)    not null,
    created     datetime        not null default generate_date(),
    balance     MONEY,
    constraint PK_USERS primary key (Id),
    constraint UQ_USERS unique (username)
)
GO

CREATE TABLE ScoreBoard (
    Id          int IDENTITY PRIMARY KEY,
    username    nvarchar(40),
    points      tinyint,
    FOREIGN KEY (username)  REFERENCES Users (username)
        ON DELETE CASCADE ON UPDATE CASCADE
)
GO


EXEC generate_random_users 1000
GO

EXEC generate_random_score 50
GO

SELECT count(*) FROM Users
GO


SELECT count(*) FROM ScoreBoard
GO

SELECT CAST(serverproperty('babelfishversion') AS VARCHAR)
GO
```