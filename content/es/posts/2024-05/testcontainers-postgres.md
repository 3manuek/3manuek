---
title: "Personalización de Testcontainers para pruebas de Postgres"
subtitle: "Pruebas efímeras de Postgres con Testcontainers de Go"
date: 2024-05-26
author: "3manuek"
draft: false
series: "Testcontainers"
tags:
  - Testcontainers
  - Postgres
  - Golang
  - Docker
---


Testcontainers te permite probar tu código con _contenedores efímeros_ directamente dentro de tus pruebas. 
Proporciona diferentes módulos para simplificar el proceso, sin embargo, a veces puedes necesitar 
personalizar el contenedor más allá de los parámetros predeterminados o su contenido.

> [Código Fuente](https://github.com/3manuek/pgtestcontainers) del laboratorio. Todos los ejemplos
> son funcionales, sigue las instrucciones en el archivo README para configurar.
> El archivo csv se genera por la configuración de Docker Compose, puedes regenerar el ejemplo
> ejecutando `docker compose up -d`. 


Testcontainers ofrece una API genérica de contenedores, y para servicios específicos, proporciona módulos
que son ayudantes con las configuraciones más comunes. Los módulos disponibles se pueden encontrar [aquí](https://testcontainers.org/modules/).

En este post veremos algunas de las consideraciones en las últimas actualizaciones de API en Testcontainers `v0.31.0`.

Si no tienes una buena idea de qué puede hacer Testcontainers, intentaré elaborar así:

> Ejecutar contenedores efímeros de cualquier tipo para hacer (principalmente) pruebas de integración o funcionales.

Es muy conveniente si tienes una gran cantidad de _Servicios Como Una Dependencia_, si tal término
existe. Pero ciertamente, juega un papel en el desarrollo dirigido por pruebas, simplificando la prueba para arquitecturas de servicios complejas.
La documentación de los módulos usados en el laboratorio se puede encontrar en los siguientes enlaces:

- [Generic Containers](https://golang.testcontainers.org/quickstart/)
- [Postgres Module](https://golang.testcontainers.org/modules/postgres/)
- [Docker Compose](https://golang.testcontainers.org/features/docker_compose/)

El laboratorio se puede ejecutar de la siguiente manera

```bash
go run main.go # generic run, no test
go test -v generic_test.go --args -imageName=postgres:16-bookworm
go test -v ts_test.go
```
 
o ejecutando `./e2e.sh`.

{{< notice "info" >}}

El laboratorio cargará y ejecutará la migración de datos, ver el contenido de los scripts de inicialización
dentro de la carpeta `test`.

{{< /notice >}}


----

## Usando Generic Container request

Construir un contenedor genérico requiere inicializar creando una _solicitud_ (`ContainerRequest`), y pasando 
la solicitud al constructor `GenericContainer`. También establecemos un flag en el script de prueba para que sea posible
cambiar la imagen en cada prueba. Si usas una imagen no compatible con el módulo Postgres, esta podría ser tu opción. 

> Ejemplo completo en [generic_test.go](https://github.com/3manuek/pgtestcontainers/blob/main/generic_test.go).

{{< tabs tabTotal="3">}}

{{% tab tabName="imageName flag" %}}
```go
// go test -v main_test.go -args -imageName=...
var imageName = flag.String("imageName", "postgres:16-bookworm", "URL of the image")
```

{{% /tab %}}

{{% tab tabName="Request Build" %}}

```go
	ctx := context.Background()

	req := tc.ContainerRequest{
		Image:        *imageName,
		ExposedPorts: []string{"5432/tcp"},
		Env: map[string]string{
			"POSTGRES_PASSWORD":         "postgres",
			"POSTGRES_HOST_AUTH_METHOD": "trust"},
		WaitingFor: wait.ForLog("Ready to accept connections"),
		Files: []tc.ContainerFile{
			{
				HostFilePath:      "test/generic",
				ContainerFilePath: "/docker-entrypoint-initdb.d",
				FileMode:          0o666,
			},
			{
				HostFilePath:      "test/containerdata/devices.csv",
				ContainerFilePath: "/tmp/devices.csv",
				FileMode:          0o666,
			},
		},
	}
```

{{% /tab %}}

{{% tab tabName="Container Run" %}}
```go
	postgresC, _ := tc.GenericContainer(ctx, tc.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	defer func() {
		if err := postgresC.Terminate(ctx); err != nil {
			t.Fatalf("failed to terminate container: %s", err)
		}
	}()
```
{{% /tab %}}
{{< /tabs >}}


----

## Usando Postgres Module con una imagen no-vanilla 

¿Qué pasa con las imágenes que son servicios Postgres pero no son una imagen vanilla? Este módulo soporta 
diferentes imágenes que son compatibles con la imagen oficial de Postgres. Un ejemplo de tal podría ser
la imagen Timescale, que está basada en la imagen oficial de Postgres, pero agrega la extensión y su
inicialización.

El módulo Postgres permite iniciar el contenedor en un solo paso, y proporciona un conjunto de funciones ayudantes
para extraer la información del contenedor

> Ejemplo completo en [ts_test.go](https://github.com/3manuek/pgtestcontainers/blob/main/ts_test.go).

{{< tabs tabTotal="3">}}

{{% tab tabName="Initialization" %}}
```go
	ctx := context.Background()
	dbName := "iot"
	dbUser := "postgres"
	dbPassword := "password"

	usageData := filepath.Join("test/containerdata", "devices.csv")
	r, err := os.Open(usageData)
	if err != nil {
		t.Fatal(err)
	}
	postgresContainer, err := postgres.RunContainer(ctx,
		tc.WithImage("timescale/timescaledb:latest-pg16"),
		// We execute the generator with docker-compose, so we have a deterministic test
		// postgres.WithInitScripts(filepath.Join("test/containerdata", "003_generator.sql")),
		postgres.WithInitScripts(filepath.Join("test/timescale", "004_init.sql")),
		postgres.WithInitScripts(filepath.Join("test/timescale", "005_load.sql")),
		postgres.WithDatabase(dbName),
		postgres.WithUsername(dbUser),
		postgres.WithPassword(dbPassword),
		tc.CustomizeRequest(tc.GenericContainerRequest{
			ContainerRequest: tc.ContainerRequest{
				Files: []tc.ContainerFile{
					{
						Reader:            r,
						HostFilePath:      usageData,
						ContainerFilePath: "/tmp/devices.csv",
						FileMode:          0o666,
					},
				},
			}}),
		tc.WithEnv(map[string]string{
			"TS_TUNE_MEMORY":   "1GB",
			"TS_TUNE_WAL":      "1GB",
			"TS_TUNE_NUM_CPUS": "2"}),
		tc.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(10*time.Second)), // we add a large startup due that we are loading data
	)
```

{{% /tab %}}

{{% tab tabName="ConnectionString helper" %}}
```go
	// Database pointer creation
	connStr, err := postgresContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatalf("failed to get connection string: %s", err)
	}
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("failed to open database: %s", err)
	}
	defer db.Close()
```
{{% /tab %}}

{{% tab tabName="Execute command inside the container" %}}
```go
	if _, out, err := postgresContainer.Exec(ctx, []string{"psql", "-U", dbUser, "-w", dbName, "-c", `SELECT count(*) from devices;`}); err != nil {
		log.Println(err)
		t.Fatal("couldn't count devices")
	} else {
		// read io.Reader out
		io.Copy(os.Stdout, out)
	}
```

{{% /tab %}}

{{< /tabs >}}

----

## Usando docker compose 

Otra forma sería reutilizar una definición de Docker Compose. 

> Ejemplo completo en [compose_test.go](https://github.com/3manuek/pgtestcontainers/blob/main/compose_test.go).

{{< tabs tabTotal="2">}}

{{% tab tabName="Docker Compose" %}}

```yaml
networks:
  # A network for the data traffic 
  data:

services:
  timescale:
    image: timescale/timescaledb:latest-pg16
    ## Once in prod
    # restart: always
    container_name: "pgtc-ts"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=iot
      - TS_TUNE_MEMORY=1GB
      - TS_TUNE_WAL=1GB
      - TS_TUNE_NUM_CPUS=2
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - data
    ports:
      - 15432:5432
    volumes:
      - ./_pgdata:/var/lib/postgresql/data
      - ./test/timescale:/docker-entrypoint-initdb.d
      - ./test/containerdata/devices.csv:/tmp/devices.csv
```

{{% /tab %}}

{{% tab tabName="Executing the container" %}}
```go
import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	tc "github.com/testcontainers/testcontainers-go/modules/compose"
)

func TestSomething(t *testing.T) {
	compose, err := tc.NewDockerCompose("docker-compose.yaml")
	require.NoError(t, err, "NewDockerComposeAPI()")

	t.Cleanup(func() {
		require.NoError(t, compose.Down(context.Background(), tc.RemoveOrphans(true), tc.RemoveImagesLocal), "compose.Down()")
	})

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	require.NoError(t, compose.Up(ctx, tc.Wait(true)), "compose.Up()")

	// Do tests...
}
```
{{% /tab %}}
{{< /tabs >}}


> Puedes estar preguntándote sobre el prefijo numérico en este ejemplo. Ten en cuenta que algunas imágenes de Postgres
> pueden haber incluido otros archivos en la carpeta `docker-entrypoint-initdb.d`. p. ej., la imagen `Timescale`
> viene con 2 archivos, así que no queremos sobrescribirlos. El orden de ejecución de los archivos es relevante,
> así que ten cuidado de esto si tus operaciones requieren varios pasos.

