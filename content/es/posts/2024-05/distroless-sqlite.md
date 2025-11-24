---
title: "Construyendo binarios dinámicamente enlazados en imágenes distroless"
subtitle: "Ejemplo de caso de uso SQLite3/Golang"
date: 2024-05-14
author: "3manuek"
draft: false
# series: "Bash"
tags:
  - Distroless
  - SQLite
  - Golang
  - Docker
---

## Caso

He estado desarrollando una aplicación en Go que usa SQLite como caché local del backend. La
historia terminaría ahí si no fuera que decidí ir por una imagen distroless para propósitos de optimización,
y también, ¿por qué no?

La cosa aquí es que para habilitar ciertas características del driver `database/sql`, el artefacto debería
estar dinámicamente enlazado a través de `CGO_ENABLED=1` y con `-tags "fts5"` (para el soporte de la característica FTS5,
ver [este comentario del issue][2]).

De lo contrario, si no usas ninguna etiqueta de característica en el driver -- en este caso `CGO_ENABLED=0` -- el
artefacto será estático, y puedes solo usar la imagen `static-<distro>`.

Desde que las [imágenes base][3] están disponibles en los paquetes, ahora puedes componer tu binario
dinámicamente enlazado en una imagen distroless. La [imagen base][4] contiene glibc, y libssl.

## ¿Por qué Distroless?

Además de las ventajas de imágenes minimalistas, como el tamaño, hay algunos beneficios desde la perspectiva de seguridad.
Reduciendo las dependencias de la imagen, hay una reducción en vulnerabilidades de seguridad heredadas.

Hay software que no es tan directo de implementar como distroless, pero eventualmente, es posible
hacerlo.

También, algunas implementaciones podrían necesitar herramientas o depender de ellas, lo que puede ser una advertencia al implementar. Esas 
herramientas pueden implementarse como sidecars, junto a un pod -- si usas k8s, p. ej. --, pero al costo de un despliegue más complejo. 

## Construcción de Capas

Primero, ten en cuenta que necesitas construir tu componente en la misma distribución que la 
que quieres usar como distroless. Si echas un vistazo a las [imágenes disponibles para Golang](https://hub.docker.com/_/golang/),
verás que cada versión tiene una distribución upstream diferente.

El siguiente ejemplo, compila el artefacto en `golang:1.22-bookworm`(Debian 12) y 
copia el artefacto generado a la imagen distroless `gcr.io/distroless/base-debian12`.

```docker
## Build layer
FROM golang:1.22-bookworm as build
WORKDIR /go/scr/app_demo
COPY . .

RUN go mod download
RUN go vet -v ./...
RUN go test -v ./...

RUN CGO_ENABLED=1 go build -tags "fts5"  -o /app/app_demo cmd/backend/main.go
RUN chmod a+x /app/app_demo

## Final image 
FROM gcr.io/distroless/base-debian12
COPY --from=build /app /app
WORKDIR /app
CMD ["/app/app_demo"]
```

### Tamaños

La imagen final en mi caso con el `base` es de aproximadamente 65.4MBs. Una imagen más pequeña con glibc, `cgr.dev/chainguard/glibc-dynamic`
terminó con ~32MBs, que es adecuada si no esperas usar libssl.


## Ejecutando imagen

Construir el binario podría tomar algo de tiempo, especialmente si ejecutas la generación de código, instalar templ
, o hacer el `vet` completo sobre el código. Para desacoplar estos, agregaremos los archivos de configuración
y directorios para assets personalizados vía `volumes`. Esto nos permitirá modificar la configuración localmente
en el host, en lugar de copiar archivos a la imagen.

> **No podrás escribir un archivo directamente en la imagen**, esa es la razón por la que mapeamos un volumen 
a una carpeta local que contendrá el archivo de base de datos para SQLite. 


```yaml
networks: 
  app_demo:

services:
  backend:
    build:
      context: .
      dockerfile: ./docker/backend/Dockerfile
    image: app_demobackend
    container_name: "app_demo_backend"
    ports:
      - 8082:8082
    volumes:
      - type: bind
        source: ./docker/backend/app_demo.yaml
        target: /app/app_demo.yaml
      - ./docker/backend/cache:/app/cache
    env_file:
      - ./docker/backend/.env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_demo
    command: >
      /app/app_demo -index=true -config=/app/app_demo.yaml

... other services ...
```   

El volumen `/app/cache` es una carpeta vacía en el host que se montará para mantener el archivo de base de datos
localmente. 

[2]: https://github.com/mattn/go-sqlite3/issues/756#issuecomment-1049493077
[3]: https://github.com/GoogleContainerTools/distroless/issues/1342#issuecomment-1699710779
[4]: https://github.com/GoogleContainerTools/distroless/blob/main/base/README.md

