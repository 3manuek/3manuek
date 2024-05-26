---
title: "Building dynamically linked binaries in distroless images"
subtitle: "A SQLite3/Golang use case example"
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

## Case

I've been developing an application in Go that uses SQLite as a local cache of the backend. The
story would end there if it wasn't that I decided to go for a distroless image for opmitization purposes,
and also, why not?

The thing here is that for enabling certain features of the `database/sql` driver, the artifact should
be dynamically linked through `CGO_ENABLED=1` and with the `-tags "fts5"` (for the FTS5 feature support,
see [this issue comment][2]).

Otherwise, if you don't use any feature tag in the driver -- in this case `CGO_ENABLED=0` -- the
artifact will be static, and you can just use the `static-<distro>` image.

Since [base images][3] are available in the packages, you can now compose your dinamically linked
binary in a distroless image. [Base image][4] contains glibc, and libssl.

## Why Distroless?

Aside of the perks of minimalistic images, such as size, there are some benefits from the security perspective.
Reducing the image dependencies, there is a reduction on inherited security vulnerabilities.

There is software that ain't that straightfoward to implement as a distroless, but eventually, it is possible
to do so.

Also, some implementations might need tooling or rely on it, which can be a caveat when implementing. Those 
tools can be implemented as sidecars, along a pod -- if you use k8s, eg. --, but at the cost of a more complex
deployment. 

## Layer Building

First, keep in mind that you need to build your component in the same distribution as the 
one you want to use as the distroless. If you take a peek on the [available images for Golang](https://hub.docker.com/_/golang/),
you'll see that each version has a different upstream distribution.

The following example, compiles the artifact in `golang:1.22-bookworm`(Debian 12) and 
copies the generated artifact to the distroless image `gcr.io/distroless/base-debian12`.

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

### Sizes

The final image in my case with the `base` is about 65.4MBs. A smaller image with glibc, `cgr.dev/chainguard/glibc-dynamic`
ended up with a ~32MBs, which is suitable if you don't expect to use libssl.


## Executing image

Building the binary might take some time, specially if running the code generation, install templ
, or do the full `vet` over the code. In order to decouple these, we'll add the configuration files
and directories for custom assets via `volumes`. This will allow us to modify the configuration locally
in the host, instead of copying files to the image.

> **You won't be able to write a file directly into the image**, that's the reason on why we map a volume 
to a local folder that will contain the database file for SQLite. 


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

The volume `/app/cache` is an empty folder in the host that will be mounted for keeping the database
file locally. 

[2]: https://github.com/mattn/go-sqlite3/issues/756#issuecomment-1049493077
[3]: https://github.com/GoogleContainerTools/distroless/issues/1342#issuecomment-1699710779
[4]: https://github.com/GoogleContainerTools/distroless/blob/main/base/README.md