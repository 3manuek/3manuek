---
title: "Dividiendo el connection pooling"
subtitle: "Una mejor práctica para manejar el connection pooling"
date: 2024-10-02
author: "3manuek"
draft: true
series: "Postgres"
tags:
  - Postgres
---


NOTAS
Es una buena práctica dividir los connection poolers por aplicación con lógica de conexión diferente. Algunos de los beneficios:

- Gestionar el pooling independientemente, con persistencia de conexión del lado del servidor personalizada y configuraciones.
- Aislar problemas potenciales entre aplicaciones. Las aplicaciones con una conexión persistente más larga robarán capacidad en el pool a menos que asignes un tamaño de pool diferente por usuario, lo que lleva a tener un aprovisionamiento separado solo para el pool.
- No todos los poolers son single-threaded, sin embargo el pool más popular (pgbouncer) hace esto. Tiene ciertas ventajas, particularmente en la filosofía cloud-native y entornos K8s. Teniendo esto en cuenta, tu capacidad de conexión estará vinculada a una sola unidad de núcleo, lo que puede llevar a una saturación potencial de este recurso.
- Para servicios de conexión de pool multi-worker como pgcat, ten en cuenta que hay una sobrecarga considerable cuando usas configuraciones complejas -- CUANTIFICAR

