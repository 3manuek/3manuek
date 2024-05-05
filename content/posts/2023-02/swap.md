---
title: "[Useless Code] Swapping variable values with no additional libraries"
subtitle: "Like, you want to make your life harder"
date: 2023-02-23
draft: false
tags:
    - C
    - ASM
---

## Background

There was a contest in an internet thread about how to code a variable swap as low-level and minimal as possible. 
So, I ended up writing a low-level function in C calling instructions for a modern amd64 platform.


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

The explanation of the above is quite simple. We use registers to allocate the values and call them in a different order
using `movl` instruction. The `main` is just a wrapper that passes arguments.