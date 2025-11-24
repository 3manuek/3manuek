---
title: "[Código Inútil] Intercambiando valores de variables sin bibliotecas adicionales"
subtitle: "Como, quieres hacer tu vida más difícil"
date: 2023-02-23
draft: false
tags:
    - C
    - ASM
---

## Background

Hubo un concurso en un hilo de internet sobre cómo codificar un intercambio de variables tan bajo nivel y minimalista como sea posible. 
Entonces, terminé escribiendo una función de bajo nivel en C llamando instrucciones para una plataforma amd64 moderna.


```c
#include <stdio.h>
#include <stdlib.h>

void swapshit(int *arg1, int *arg2) {

   __asm__ __volatile__ ("movl %2, %%eax;"
                         "movl %3, %%ebx;"
                         "movl %%eax, %0;"
                         "movl %%ebx, %1;"
                         : "=g" (*arg2) , "=g" (*arg1) 
                         : "a" (*arg1), "b" (*arg2)  );
} 

int main(int argc, char *argv[]) 
{
   int arg1 = atoi(argv[1]);
   int arg2 = atoi(argv[2]);
   swapshit(&arg1,&arg2);
   printf("arg1 es %d , arg2 es %d\n",arg1,arg2);
   return 0;
}  
```

La explicación de lo anterior es bastante simple. Usamos registros para asignar los valores y los llamamos en un orden diferente
usando la instrucción `movl`. El `main` es solo un wrapper que pasa argumentos.

