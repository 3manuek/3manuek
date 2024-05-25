---
title: "Testcontainers for Postgres testing"
subtitle: "Beyond the exmaples and with up-to-date customizers"
date: 2024-05-22
author: "3manuek"
draft: true
# series: "Bash"
tags:
  - Testcontainers
  - Postgres
  - Golang
  - Docker
---


Testcontainers allow you to test your code with ephemeral containers right inside your tests. 
It provides different modules for simplifying the process, however, sometimes you many need 
to customize the container beyond the default parameters or it contents.

> [Source Code](https://github.com/3manuek/pgtestcontainers) of the laboratory.

Testcontainers offers a generic container API, and for specific services, it provides modules
that are helpers with the most common settings. Available modules can be found [here](https://testcontainers.org/modules/).

In this post we will through some of the considerations in the latest API updates in Testcontainers `v0.31.1`.

If you don't have a good idea what Testcontainers can do, I'll try to ellaborate like this:

> Running ephemeral containers of any kind for doing (mostly) integration or functional tests.

It is pretty convinient if you happen to have a large amount of _Services As A Depenpency_, if such a term
exists. The documentation for the modules that are used in this post are in:

- [Generic Containers](https://golang.testcontainers.org/quickstart/)
- [Postgres Module](https://golang.testcontainers.org/modules/postgres/)
- [Docker Compose](https://golang.testcontainers.org/features/docker_compose/)



## Using Generic Container request

Building a generic container requires to initialize by creating a _request_ (`ContainerRequest`), and passing 
the request to the `GenericContainer` constructor.

{{< tabs tabTotal="2">}}

{{% tab tabName="Building theRequest" %}}

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

{{% tab tabName="Executing the container" %}}
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





> You may wondering about the number prefix in this example. Keep in mind that some Postgres images
> may have included other files in the `docker-entrypoint-initdb.d` folder. eg., the `Timescale` image
> comes with 2 files, so we don't want to override them. The order of the files execution is relevant,
> so beware of this if your operations do require several steps.

