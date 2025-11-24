---
title: "Corrección de Go-Plus y Atom GOPATH"
subtitle: "Una corrección para el GOPATH no cargado."
excerpt: ""
date: 2016-10-05
author: "3manuek"
draft: false
series: "Golang"
tags:
  - Golong
---

![Go](/images/posts/golang.png)

## El contexto

Golang es un lenguaje increíble, pero lo encontré bastante inestable dentro de las variables de entorno (al menos en macOS Sierra/El Capitan). `gvm` es tu amigo por cierto, y me ayudó a corregir algunos de los problemas instalando el último release candidate de la serie 1.7.1.

Ten en cuenta que si quieres actualizar tu macOS a Sierra, necesitarás hacer backup de todas tus variables de entorno y reinstalar `gvm`.

Atom tiene un plugin para Golang, que es `go-plus`, y si estás leyendo esto es porque la documentación alrededor no es muy útil.

## El problema

¡GOPATH no está siendo cargado! También puedes ver varios errores cuando Atom está intentando obtener paquetes usando `go-get`. Tampoco la variable de entorno GOBIN.

También, he estado teniendo problemas con lo siguiente (gocode es uno de los paquetes para el plugin de Atom, pero sucede con cualquier paquete):

```
go install github.com/nsf/gocode: open /bin/gocode: operation not permitted
```


## La solución

La solución para GOPATH es simple. Hay una _advertencia_ cuando esto sucede pero ha sido agregada recientemente, con la PISTA de iniciar desde la línea de comandos para corregir esto.

Eso es fácil. Un `atom &` desde terminal debería corregir esto cargando las variables de entorno. Sin embargo, ten en cuenta que GOBIN necesita estar en el path! Puedes necesitar crear una carpeta bin en tu _workspace de go_. También, no olvides agregar esas variables en tu archivo shell _.*rc_ (.bashrc, .zshrc, .profile).

p.ej.

```
mkdir -p ~/go/bin
export GOPATH=$HOME/go
export GOBIN=$HOME/go/bin
nohup atom &
```

¡Espero que corrija tu día!

<!-- 
{% if page.comments %}
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
{% endif %} -->

