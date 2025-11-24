---
title: "HOWTO Percona Server con Docker para DBAs"
subtitle: "Iniciando contenedor Percona 5.7 docker y otros trucos."
excerpt: ""
date: 2016-07-02
author: "3manuek"
draft: false
series: "Docker"
tags:
  - Docker
  - MySQL
---

![docker](/images/posts/docker-mysql-1.png)

## Antes de iniciar el contenedor

Este artículo no es una explicación introductoria de docker, sin embargo su alcance es para principiantes de docker. Puedes considerarlo como una extensión de la bien documentada [documentación de Percona docker hub][1]. Para el código fuente de la imagen, el repositorio está en [github][2].

Aquí está todo lo que necesitas hacer para comenzar:

```bash
docker run --name percona57 -e MYSQL_ROOT_PASSWORD=<a_password>  -d percona:5.7
```

Para verificar el log de estado del contenedor, puedes ejecutar `docker logs percona57`.

## Logs adicionales de MySQL

Iniciar el contenedor es bastante fácil, pero si no estás muy acostumbrado a Docker, te encontrarás un poco perdido si quieres habilitar logging u otras características.

Por ejemplo, un contenedor con logging completo se iniciará con esto:

```bash
docker run --name percona57  -v /var/log/mysql:/var/log/mysql  -e MYSQL_ROOT_PASSWORD=mysql  -d percona:5.7 --general-log=1 --slow-query-log=1 --long-query-time=0  --log_slow_verbosity='full, profiling, profiling_use_getrusage'
```

Nota que `log_slow_verbosity` solo es aplicable para la release de Percona, y agrega salida extra que resulta muy útil cuando haces revisiones de consultas complejas. Como puedes apreciar, todas las opciones se pasan después del nombre de la imagen (percona:5.7).

Ahora, la pregunta es: ¿dónde están los logs? Generalmente, puedes acceder al contenedor usando `docker exec -it percona57 bash` y ver los logs dentro de él, aunque esta no es la forma más cómoda de hacer esto.

En el ejemplo a continuación, usaremos `jq` (un parser json muy útil).

```bash
3laptop ~ # docker ps
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS               NAMES
cb740be0743c        percona:5.7         "docker-entrypoint.sh"   35 minutes ago      Up 35 minutes       3306/tcp            percona57

3laptop ~ # docker inspect percona57 | jq .[].Mounts
[
  {
    "Propagation": "rprivate",
    "RW": true,
    "Mode": "",
    "Destination": "/var/log/mysql",
    "Source": "/var/log/mysql"
  },
  {
    "Propagation": "",
    "RW": true,
    "Mode": "",
    "Driver": "local",
    "Destination": "/var/lib/mysql",
    "Source": "/var/lib/docker/volumes/ceda51de62dac317fcafe9dd9e8f9b6f1dc5d70874466b3faf7cdfbcbbc91154/_data",
    "Name": "ceda51de62dac317fcafe9dd9e8f9b6f1dc5d70874466b3faf7cdfbcbbc91154"
  }
]

3laptop ~ # ls -l /var/lib/docker/volumes/ceda51de62dac317fcafe9dd9e8f9b6f1dc5d70874466b3faf7cdfbcbbc91154/_data
...
-rw-r----- 1 maxscale docker  26886023 Jul  2 19:10 cb740be0743c.log
-rw-r----- 1 maxscale docker 268834670 Jul  2 19:10 cb740be0743c-slow.log
...
```

Los logs (general y slow) están usando el `container id` en el nombre del archivo, que se puede apreciar al ejecutar `docker ps`.

## Acceso a través de la red

Obviamente, cuando usas docker en producción, no quieres acceder localmente. Para obtener el host de nuestro contenedor (y todos los contenedores en ejecución), podemos hacer los siguientes comandos:


```bash
3laptop ~ # docker network ls
NETWORK ID          NAME                DRIVER
5fddd2e1c80a        bridge              bridge              
e4e0c655e1aa        host                host                
565f4a23d95a        none                null  

3laptop ~ # docker network inspect 5fddd2e1c80a | jq .[].Containers
{
  "cb740be0743cd662c700f73586fe481dc25e4eb27ef94e075c4668a5421eca13": {
    "IPv6Address": "",
    "IPv4Address": "172.17.0.2/16",
    "MacAddress": "02:42:ac:11:00:02",
    "EndpointID": "6dbd28900efe2c6f6edffcbbec0ac7d6446b4336e6e31f018f18d00f1005a812",
    "Name": "percona57"
  }
}
```

Podemos ver que nuestro contenedor `percona57` está ejecutándose sobre la dirección IP `172.17.0.2`. Para acceder, solo necesitas hacer como de costumbre:

```bash
3laptop ~ # mysql -h 172.17.0.2 -p
....
mysql>
```


<!-- {% if page.comments %} 
<div id="disqus_thread"></div>
<script>

var disqus_config = function () {
this.page.url = {{ site.url }};  // Replace PAGE_URL with your page's canonical URL variable
this.page.identifier = {{ page.title }}; // Replace PAGE_IDENTIFIER with your page's unique identifier variable
};

(function() { // DON'T EDIT BELOW THIS LINE
var d = document, s = d.createElement('script');
s.src = '//3manuek.disqus.com/embed.js';
s.setAttribute('data-timestamp', +new Date());
(d.head || d.body).appendChild(s);
})();
</script>
<noscript>Please enable JavaScript to view the <a href="https://disqus.com/?ref_noscript">comments powered by Disqus.</a></noscript>
{% endif %}
-->


[1]: https://hub.docker.com/_/percona/
[2]: https://github.com/dockerfile/percona

