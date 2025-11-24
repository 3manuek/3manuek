---
title: "[Característica Earthly +v0.8.10]: Deshabilitando labels internos de Earthly"
subtitle: "Reproducibilidad en imágenes Earthly"
date: 2024-07-01
author: "3manuek"
draft: false
series: "Earthly"
tags:
  - Earthly
  - Docker
  - Go
---

> **NOTA:** _Esto aún no ha sido actualizado en la documentación de Earthly, pero estoy bastante seguro de que lo será pronto
(y actualizaré este post en consecuencia)_

## ¿Qué hacen los labels a las builds reproducibles?

Por defecto, Earthly agrega labels `dev.earthly.*` en la imagen construida. Puedes encontrarlos
haciendo un `docker inspect <imageID> | jq -r '.[].Config.Labels'`.

Aquí hay un ejemplo de la configuración de la imagen incluyendo los labels `dev.earthly.*`:

```json
    "Config": {
        ...
        "Labels": {
            "dev.earthly.built-by": "homebrew",
            "dev.earthly.git-sha": "6b41f8409d7ffef0d25072c2c04250074b6e3c72",
            "dev.earthly.version": "v0.8.14",
            ...
        }
    }
```

Probablemente puedas inferir cuál es el problema potencial con estos valores.

Si cualquiera de tu entorno de ejecución, git-sha, o versión de Earthly cambia, el
checksum de la imagen final cambia. Incluso si el contenido de la imagen es idénticamente el mismo.

Hay implementaciones de registros de imágenes que pueden manejar checksums duplicados con un mecanismo diferente,
como evitar empujar imágenes duplicadas.

Aunque estos labels son importantes en términos de información, ciertos casos de uso
requieren incluir esta información (o no) en su propio dominio de labels. Los labels impactan
en la reproducibilidad de la build, porque _cambia los hashes producidos_ de las imágenes,
llevando a potencialmente imágenes duplicadas.

Al eliminar los labels, podemos tener control total a través de nuestros labels de dominio personalizado,
y evitar que artefactos duplicados se empujen upstream.


Por eso el [flag --allow-without-earthly-labels][3] fue propuesto por el Equipo de Earthly
e implementado por mí.


> Puedes leer más información en el [issue][2].


## ¿Cómo funciona esta característica?

Desde Earthly [v0.8.10][1], se ha agregado la característica flag `--allow-without-earthly-labels`.

La forma de usar es la siguiente:

```sh
    VERSION --allow-without-earthly-labels 0.8
    # Habilita con el VERSION flag `--allow-without-earthly-labels`.
    ...
    SAVE IMAGE --push --without-earthly-labels ....
    # Agrega el flag --without-earthly-labels al comando SAVE IMAGE.
```

¡Gracias por leer!



[1]: https://github.com/earthly/earthly/releases/tag/v0.8.10
[2]: https://github.com/earthly/earthly/issues/4069
[3]: https://github.com/earthly/earthly/pull/4084

