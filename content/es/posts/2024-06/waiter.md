---
title: "Implementando una función multi-proceso funcional en Bash"
subtitle: "Usando solo comandos wait y jobs"
date: 2024-06-01
author: "3manuek"
draft: false
series: "Bash"
tags:
  - Bash
  - Parallelization
---


Si estás en este post, es porque necesitas implementar una forma consistente de agregar paralelización a tus scripts.
Esta implementación es limitada, ya que no contempla agrupar trabajos para establecer diferentes grupos de procesos
con diferentes configuraciones o prioridades.

Aunque, probablemente la mayoría de los casos solo necesitas ejecutar código que corre dentro de un bloque o simplemente
hace algo en paralelo. El comando `parallel` es una buena opción, pero requiere perder algo de legibilidad del código,
particularmente en bloques de código que podrían inyectar una semántica compleja.

Puedes comenzar con esta definición:

```bash
...
maxJobs=4
...

waiter(){
    while test $(jobs -p | wc -l) -ge $maxJobs ; do sleep 1 ; wait -n; done
}


waitall(){
    wait < <(jobs -p)
}

```

La función `waiter` hace la verificación de que el número actual de trabajos _actualmente_ generados por el proceso principal no exceda
el valor `maxJobs` usando la llamada estándar [`wait`][2]. 

El comando `wait -n` espera que el siguiente trabajo termine. Esto es para todos los trabajos que están ejecutándose en ese punto en el tiempo.
Implementar un enfoque más elaborado para esperar por grupos, sería almacenar el id del trabajo y usar `wait -f ID` y coordinar
en consecuencia.

El `jobs -p` lista los IDs de los trabajos, combinado con solo un `wc -l` simple que cuenta la lista. Si llegas a almacenar esos
IDs, es posible coordinar y configurar grupos de trabajos. También, `jobs -n` te permite listar solo esos trabajos que han
cambiado su estado, como una cola de mensajes. Consulta la [página del manual][1] para más detalles.

El `waitall` esperará todos los pids devueltos por `jobs -p`. [Ver este hilo de SO][3].

El uso es simple, y depende del concepto de bloques de código en bash. Puedes usar solo comandos simples también, pero organizar
a través de bloques bash puede ser alentado.

```bash
...
    waiter
    (
        # operations ...
    ) &
...
# una vez que el loop termine, espera todos los trabajos
waitall 
```

Aquí hay un ejemplo implementado en una función. En este caso implemento una iteración para generar trabajos, solo por el bien del
ejemplo:

```bash
function AFuncThatSpawnsSubProcesses() {
    for file in $(ls output/*.json)
    do
        # Worker initialization
        org=$(echo $file | grep -Po '(?<=_)[^_]+(?=_)')
        repo=$(echo $file | grep -Po '(?<=_)[^_]+(?=\.)')

        # Operation block
        waiter # Check and wait to a job release
        (
            someOutput=$(ExecuteSomethingInFunc $org $repo)
            ExecuteSomethingElseInFunc $someOutput
        ) &

    done
    waitall # wait the rest of jobs to finish
}

```

## Manejo de Interrupciones

Cuando generas procesos hijos, necesitas manejar interrupciones para controlar los trabajos ejecutándose
en el proceso. Si quieres manejar esto bien, o tienes intención de detener solo 
un grupo de trabajos, necesitas almacenar los PIDS -- digamos -- en un array para matarlos 
en el manejador de interrupción.

Esto te permite implementar lógica más compleja, como tener un conjunto de workers que quieres
matar de manera diferente -- almacenando el estado, p. ej. -- y otro grupo para ser matado inmediatamente.

Las siguientes definiciones son un enfoque _perezoso_, que solo mata todos los hijos y finalmente, mata
el padre.

```bash
trap "ctrlc" SIGINT

ctrlc(){
   kill $(jobs -p)  # kills childs
   pkill -P $$      # kills parent
}
```

## Reutilizando funciones 

También puedes usar un script bash estilo biblioteca como este [Gist](https://gist.github.com/3manuek/453e7dff8234da19057ad7c59e69eb3e).

```bash
. ./workers.sh
```


[1]: https://linuxcommand.org/lc3_man_pages/jobsh.html
[2]: https://linuxcommand.org/lc3_man_pages/waith.html
[3]: https://stackoverflow.com/a/36038185/3264121

