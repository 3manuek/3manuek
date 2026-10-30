---
title: "Un estudio de las actualizaciones HOT en tablas pequeñas de PostgreSQL. Estrategias de fillfactor y particionamiento hash."
subtitle: "Comparación del rendimiento y el uso de búferes en una tabla con actualizaciones frecuentes que cabe en shared_buffers."
description: "Benchmark de actualizaciones HOT en PostgreSQL, fillfactor 50 y particionamiento hash, con observaciones y limitaciones para ajustar sistemas en producción."
date: 2025-12-19
draft: false
author: "3manuek"
categories: ["PostgreSQL"]
---

¿Puede mejorar el rendimiento de una tabla pequeña de PostgreSQL con actualizaciones frecuentes si reservamos más espacio para esas actualizaciones? Comparé el esquema predeterminado, un fillfactor menor y el particionamiento hash en una tabla de aproximadamente 500 MB. La carga se centró en actualizaciones, con especial interés en las actualizaciones HOT (*heap-only tuples*).

Mi expectativa inicial era que dejar más espacio en cada página del heap favorecería las actualizaciones HOT y aumentaría la tasa de operaciones. Sin embargo, en la ejecución registrada, establecer el fillfactor en 50 tanto en la tabla como en su índice produjo un menor rendimiento y un mayor uso de búferes que el esquema predeterminado. El particionamiento hash mostró un comportamiento muy similar al predeterminado.

> **Entorno de prueba y alcance:** Realicé estas pruebas localmente utilizando contenedores Docker. Los resultados son exploratorios y corresponden a ese entorno; no constituyen un benchmark definitivo para producción. Los recursos compartidos del equipo anfitrión, los límites de los contenedores y la configuración del almacenamiento pueden influir en las mediciones. Puede ser necesario repetir las pruebas en un entorno aislado antes de extraer una conclusión definitiva para esta carga de trabajo.

## Por qué importan las actualizaciones HOT y el fillfactor

Una actualización crea una nueva versión de la fila. PostgreSQL puede utilizar HOT cuando esa versión cabe en la misma página del heap y la actualización no modifica columnas referenciadas por índices que no sean de resumen. HOT evita crear nuevas entradas en esos índices y permite recuperar el espacio de algunas versiones obsoletas durante el acceso habitual a las páginas. Consulta la [documentación de PostgreSQL sobre HOT](https://www.postgresql.org/docs/18/storage-hot.html).

Un **fillfactor de tabla** menor reserva más espacio en las páginas del heap al llenarlas, lo que aumenta las oportunidades de actualizar filas dentro de la misma página. Esto intercambia densidad de almacenamiento por espacio para actualizaciones: las mismas filas iniciales pueden ocupar más páginas. Consulta los [parámetros de almacenamiento de tablas](https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-STORAGE-PARAMETERS).

El fillfactor de la tabla y el del índice son parámetros independientes. Reservar espacio en un índice no crea espacio para actualizaciones HOT en el heap. Como este experimento redujo ambos valores a la vez, no permite aislar el efecto del fillfactor de la tabla.

## Qué comparé

| Variante | Configuración | Etiqueta original de la serie |
| --- | --- | --- |
| Predeterminada | Esquema original sin particionar, con los valores predeterminados de fillfactor | `ori` |
| Particionamiento hash | Versión de la tabla particionada por hash | `by_hash` |
| Fillfactor 50 | Fillfactor de la tabla y del índice establecido en 50 | `onlyff` |

Las notas originales del benchmark indican PostgreSQL **18.2**. Aquí no se incluyen la imagen exacta de Docker, el esquema, el número de particiones, el script de carga, la concurrencia, las especificaciones del equipo ni la configuración de PostgreSQL; estos detalles son necesarios para reproducir la comparación. También conviene contrastar la versión con los metadatos originales de la ejecución antes de publicar.

Los gráficos abarcan aproximadamente catorce minutos e incluyen un período de arranque. La tasa de operaciones continúa aumentando durante el registro, por lo que no se trata de una comparación en un estado estable demostrado. Solo los gráficos de rendimiento incluyen las tres variantes; los demás comparan fillfactor 50 con el esquema predeterminado.

Los únicos parámetros de configuración modificados fueron `shared_buffers` y `max_wal_size`, ambos establecidos en `4GB`. El objetivo era que ambas relaciones cupieran en la caché de búferes.

{{< tabs tabTotal="2">}}
{{% tab tabName="Estructura original de la tabla" %}}
```sql
CREATE TABLE small_table (
    group_id       integer NOT NULL,
    user_id         integer NOT NULL,
    team_id         integer NOT NULL,
    activity_log_id integer NOT NULL,
    edited_at       timestamp without time zone NOT NULL,
    PRIMARY KEY (group_id, user_id)
)
-- Establecer fillfactor solo en el heap
-- WITH (FILLFACTOR=50)
;

CREATE INDEX ON small_table (team_id);
```
{{% /tab %}}
{{% tab tabName="Script de pgbench" %}}
```sql
\set user_id_rand random(1, 100000)

DO $$
DECLARE
    user_id_ran integer;
    group_id_ran integer;
    team_id_ran integer;
    last_user_id integer;
BEGIN

    SELECT user_id, group_id, team_id
        FROM users WHERE user_id = :user_id_rand
     INTO user_id_ran, group_id_ran, team_id_ran;

    INSERT INTO small_table ("group_id","user_id","team_id","activity_log_id","edited_at") 
        VALUES (group_id_ran,user_id_ran,team_id_ran,nextval('activity_log_id_seq'),now()) 
        ON CONFLICT (group_id, user_id) 
        DO UPDATE SET "activity_log_id"=EXCLUDED."activity_log_id","edited_at"=EXCLUDED."edited_at" ;

END $$ LANGUAGE plpgsql;
```

{{% /tab %}}
{{< /tabs >}}

### Comparación de TPS y bloat (versión 13.23)

| Tabla | Tamaño | TPS |
| --- | --- | --- |
| Original | 938MB | 278K |
| Fillfactor=50 | 1.40GB | 275K |

## Qué muestra esta ejecución

- **El particionamiento hash mantuvo un rendimiento cercano al predeterminado.** Esta ejecución no muestra una mejora clara ni una penalización importante. Tampoco demuestra que el coste adicional del particionamiento sea insignificante para otras consultas o cargas.
- **Fillfactor 50 produjo, en general, una menor tasa de operaciones.** En la última muestra de TPS, la variante predeterminada alcanzó 3940 TPS; el particionamiento hash, 3840 TPS; y fillfactor 50, 3340 TPS. Son muestras individuales, no promedios de la ejecución ni diferencias demostradas estadísticamente.
- **El uso de búferes divergió considerablemente.** En la última muestra, la variante con fillfactor reducido tenía 78 571 búferes frente a 10 527 de la predeterminada: aproximadamente 7,5 veces más. Los búferes sucios mostraron una proporción similar al final. Estos recuentos describen el estado registrado de la caché, no un aumento del tamaño configurado de `shared_buffers` ni una medición directa de la E/S física.
- **Una mayor actividad HOT inicial no se tradujo en un mayor rendimiento sostenido.** La variante con fillfactor reducido comienza con más actividad HOT registrada, pero la predeterminada la supera posteriormente. Los recuentos o tasas absolutos de HOT deben interpretarse junto con el total de actualizaciones.
- **Una menor estimación de tuplas muertas no coincidió con un mayor rendimiento.** La variante con fillfactor reducido termina con una estimación menor, pero eso por sí solo no demuestra un menor coste de limpieza ni un mejor rendimiento global.

Un conjunto de trabajo mayor es una posible explicación del menor rendimiento. Estos gráficos por sí solos no permiten distinguir ese efecto del de la distribución física del índice, la actividad de los checkpoints, el comportamiento de vacuum o la competencia por recursos en el equipo local.

## Cómo interpretar las mediciones

A continuación se conservan las muestras numéricas originales. Los TPS y la tasa de actualizaciones miden cosas distintas: una transacción puede contener más de una operación. El número de búferes describe la ocupación de la caché en un momento dado, mientras que los búferes sucios son páginas modificadas en memoria. Ninguno de esos gráficos mide directamente la latencia del almacenamiento ni el ancho de banda de escritura.

Para analizar HOT, compara el incremento de `n_tup_hot_upd` con el de `n_tup_upd` durante el **mismo intervalo**. Un valor absoluto de HOT mayor no implica necesariamente un porcentaje HOT mayor. PostgreSQL proporciona `n_dead_tup` como una estimación, y los aciertos de bloques de índice representan accesos resueltos desde la caché de búferes de PostgreSQL. Aquí no se han registrado las consultas ni las transformaciones originales del exportador, de modo que los gráficos de HOT y de aciertos de índice no deben interpretarse como tasas por segundo verificadas. Consulta la [documentación de estadísticas de PostgreSQL](https://www.postgresql.org/docs/18/monitoring-stats.html).

## Resultados registrados

### Comparación de TPS entre v13 y v18

{{< chart >}}

const data = {
                labels: [1768778038.937,1768778043.937,1768778048.937,1768778053.937,1768778058.937,1768778063.937,1768778068.937,1768778073.937,1768778078.937,1768778083.937,1768778088.937,1768778093.937,1768778098.937,1768778103.937,1768778108.937,1768778113.937,1768778118.937,1768778123.937,1768778128.937,1768778133.937,1768778138.937,1768778143.937,1768778148.937,1768778153.937,1768778158.937,1768778163.937,1768778168.937,1768778173.937,1768778178.937,1768778183.937,1768778188.937,1768778193.937,1768778198.937,1768778203.937,1768778208.937,1768778213.937,1768778218.937,1768778223.937,1768778228.937,1768778233.937,1768778238.937,1768778243.937,1768778248.937,1768778253.937,1768778258.937,1768778263.937,1768778268.937,1768778273.938],
                datasets: [{
                    label: "v13 Original (TPS: 26678.24, Latencia: 1.344ms, Desv. est.: 1.444ms)",
                    data: [26539.4,27731.3,27520.8,27591.5,27508.5,27495.5,27587.9,27465.9,23035.6,27530.8,28022.0,27903.9,27706.3,27240.8,27283.2,27464.0,27455.4,27064.9,26782.5,26758.3,23227.2,27177.2,27379.9,27829.1,26422.9,26989.6,27121.6,27188.0,27383.3,26852.2,27072.0,26807.4,22935.8,27057.3,27036.7,27166.0,26292.1,27130.5,26301.1,26261.7,27085.8,27025.8,27179.9,20084.8,22485.5,27229.2,26955.7,27091.2],
                    borderColor: 'rgb(255, 165, 0)',
                    backgroundColor: 'rgb(255, 165, 0)',
                    tension: 0.1
                }, {
                    label: "v13 Fillfactor=50 (TPS: 27351.30, Latencia: 1.311ms, Desv. est.: 1.425ms)",
                    data: [26779.7,27400.1,21009.5,26583.8,27399.4,27514.9,27908.8,25276.1,25725.9,28025.8,27921.0,28081.8,27907.2,28062.1,28096.3,28007.7,27361.1,27693.6,28486.0,25724.3,25442.8,27991.3,27840.3,28184.3,27544.8,27865.7,28332.1,28202.6,28641.4,28296.8,28274.8,25642.0,24988.2,27322.1,28246.4,28623.9,27837.3,28069.0,27667.1,28025.5,28240.9,28141.7,28501.2,25829.3,25420.6,26830.7,27965.2,27870.3],
                    borderColor: 'rgb(0, 255, 0)',
                    backgroundColor: 'rgb(0, 255, 0)',
                    tension: 0.1
                }, {
                    label: "v18 Original (TPS: 27883.83, Latencia: 1.286ms, Desv. est.: 1.423ms)",
                    data: [27306.3,28871.0,28568.9,28743.4,28556.3,28814.7,28484.7,28082.5,27367.3,27813.2,27855.3,27702.8,28154.5,28441.4,27957.9,28080.8,27865.9,28712.3,28520.3,27051.2,27759.0,28412.3,28371.3,27710.8,28185.7,28292.9,27660.2,27712.4,28493.1,28571.3,28380.5,27974.5,28848.4,28226.7,27769.7,28267.1,27978.2,27816.9,27455.9,28907.7,27409.5,26804.7,28195.2,26777.5,26462.7,21137.4,28081.7,27443.4],
                    borderColor: 'rgb(200, 40, 120)',
                    backgroundColor: 'rgb(200, 40, 120)',
                    tension: 0.1
                }, {
                    label: "v18 Fillfactor=50 (TPS: 28614.75, Latencia: 1.253ms, Desv. est.: 1.350ms)",
                    data: [27344.5,28279.1,28136.8,27819.2,28234.1,29042.4,29745.4,28265.2,29153.2,28674.3,28654.4,26664.6,28815.3,29019.7,29498.7,28844.2,29414.0,28245.5,28606.2,28218.0,28911.4,29280.4,28831.2,28990.2,29594.2,28473.1,28908.0,28240.6,28623.6,28719.7,28731.5,28177.9,28509.2,28955.0,28867.4,28893.0,28778.8,29139.1,28977.8,29162.1,28845.6,28044.7,28392.6,28114.4,28810.3,28869.7,27876.5,26766.8],
                    borderColor: 'rgb(29, 122, 235)',
                    backgroundColor: 'rgb(29, 122, 235)',
                    tension: 0.1
                },
                {
                    label: "v17 Original (TPS: 27844.98, Latencia: 1.288ms, Desv. est.: 1.357ms)",
                    data: [27215.4,28391.2,28347.9,27978.7,28395.4,28472.7,27512.8,27781.8,28313.4,28160.9,27457.3,26843.5,27454.1,27989.8,27408.6,27608.4,27621.4,27600.8,27681.2,27083.7,27004.5,26590.4,27245.9,27205.7,27557.4,27911.4,28905.5,28643.0,28267.2,28019.0,28063.3,28287.5,28187.2,28810.5,28421.9,27611.9,27096.1,27378.2,27693.4,27908.6,27963.2,28002.3,27730.1,27844.1,26808.2,28713.0,28479.6,28527.3],
                    borderColor: 'rgb(155, 155, 0)',
                    backgroundColor: 'rgb(155, 155, 0)',
                    tension: 0.1
                }, {
                    label: "v17 Fillfactor=50 (TPS: 28846.99, Latencia: 1.243ms, Desv. est.: 1.379ms)",
                    data: [28804.0,29883.0,29137.0,29852.0,29836.1,29031.9,29090.3,29166.9,29199.5,28781.2,28520.8,29173.2,27246.7,29253.4,28026.3,29655.9,29361.0,29330.7,29478.1,29915.2,29398.2,28936.9,28663.0,29659.1,28277.3,29799.3,29541.3,29656.9,29868.5,29232.1,29651.6,29114.9,28999.2,28762.4,28504.9,29065.7,27162.4,28581.1,28527.3,28341.9,28778.2,28615.1,28484.5,28582.1,29119.0,28735.5,24390.6,25122.3],
                    borderColor: 'rgb(128, 128, 128)',
                    backgroundColor: 'rgb(128, 128, 128)',
                    tension: 0.1
                }].filter(dataset => dataset.data && dataset.data.length > 0)
            };

            const tpsLineConfigs = [{
                label: "v13 Original (TPS: 26678.24, Latencia: 1.344ms, Desv. est.: 1.444ms)",
                tps: 26678.241716,
                color: 'rgb(255, 165, 0)'
            }, {
                label: "v13 Fillfactor=50 (TPS: 27351.30, Latencia: 1.311ms, Desv. est.: 1.425ms)",
                tps: 27351.303047,
                color: 'rgb(0, 255, 0)'
            }, {
                label: "v18 Original (TPS: 27883.83, Latencia: 1.286ms, Desv. est.: 1.423ms)",
                tps: 27883.825854,
                color: 'rgb(200, 40, 120)'
            }, {
                label: "v18 Fillfactor=50 (TPS: 28614.75, Latencia: 1.253ms, Desv. est.: 1.350ms)",
                tps: 28614.752106,
                color: 'rgb(29, 122, 235)'
            }, {
                label: "v17 Original (TPS: 27844.98, Latencia: 1.288ms, Desv. est.: 1.357ms)",
                tps: 27844.980004,
                color: 'rgb(155, 155, 0)'
            }, {
                label: "v17 Fillfactor=50 (TPS: 28846.99, Latencia: 1.243ms, Desv. est.: 1.379ms)",
                tps: 28846.987740,
                color: 'rgb(128, 128, 128)'
            }];

            tpsLineConfigs.forEach((item) => {
                if (!Number.isFinite(item.tps) || data.labels.length === 0) {
                    return;
                }
                data.datasets.push({
                    label: '',
                    data: data.labels.map(() => item.tps),
                    borderColor: item.color,
                    borderDash: [6, 6],
                    borderWidth: 1,
                    pointRadius: 0,
                    pointHitRadius: 0,
                    tension: 0,
                    fill: true,
                    isTpsLine: true,
                    tpsValue: item.tps
                });
            });

            // Check if we have any data
            if (data.datasets.length === 0) {
                throw new Error('No data available to display');
            }

            // Ensure labels array matches the data length
            if (data.labels.length === 0 && data.datasets[0].data.length > 0) {
                // Generate default labels if missing
                data.labels = data.datasets[0].data.map((_, i) => i);
            }

            const ctx = document.getElementById('chart');
            if (!ctx) {
                throw new Error('Canvas element not found');
            }

            const tpsLineLabelPlugin = {
                id: 'tpsLineLabelPlugin',
                afterDatasetsDraw(chart) {
                    const {ctx, chartArea, scales} = chart;
                    const yScale = scales.y;
                    if (!yScale) {
                        return;
                    }
                    ctx.save();
                    chart.data.datasets.forEach((dataset) => {
                        if (!dataset.isTpsLine || !Number.isFinite(dataset.tpsValue)) {
                            return;
                        }
                        const y = yScale.getPixelForValue(dataset.tpsValue);
                        const x = chartArea.right + 6;
                        ctx.fillStyle = dataset.borderColor || '#000';
                        ctx.font = '11px sans-serif';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(dataset.tpsValue.toFixed(2), x, y);
                    });
                    ctx.restore();
                }
            };

            new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                layout: {
                    padding: {
                        right: 60
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'pgbench: comparación de TPS de actualizaciones HOT. Clientes:36 Trabajadores:3 Tiempo:240 Registros:15'
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            filter: (legendItem, chartData) => {
                                const dataset = chartData.datasets[legendItem.datasetIndex];
                                return !dataset || !dataset.isTpsLine;
                            },
                            usePointStyle: true,
                            pointStyle: 'rect',
                            boxWidth: 12,
                            boxHeight: 12,
                            padding: 15,
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tiempo (segundos)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'TPS'
                        }
                    }
                }
            },
            plugins: [tpsLineLabelPlugin]
            });
{{< /chart >}}

### Comparación de TPS

Transacciones por segundo de las tres variantes. Compara las trayectorias y los valores finales; el aumento continuo de la tasa limita las conclusiones sobre el rendimiento en estado estable.

{{< chart >}}
        const data = {
            labels: ['20:46:50', '20:47:00', '20:47:10', '20:47:20', '20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '20:59:00', '20:59:10', '20:59:20', '20:59:30', '20:59:40', '20:59:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50', '21:01:00'],
            datasets: [{
                label: "Predeterminada",
                data: [2.0, 1.0, 0.7, 0.9, 811.0, 1850.0, 1570.0, 1670.0, 1310.0, 1580.0, 1280.0, 1530.0, 1520.0, 1390.0, 1310.0, 987.0, 1610.0, 1470.0, 1300.0, 1510.0, 1440.0, 1650.0, 1270.0, 1470.0, 1850.0, 2140.0, 2160.0, 1910.0, 2050.0, 2029.9999999999998, 2140.0, 1930.0, 2080.0, 2120.0, 1880.0, 1530.0, 2290.0, 2000.0, 2590.0, 2410.0, 2080.0, 2580.0, 2080.0, 2990.0, 1970.0, 3070.0, 2510.0, 1820.0, 2410.0, 2040.0, 1380.0, 2770.0, 2710.0, 2340.0, 2760.0, 3210.0, 2830.0, 2880.0, 3190.0, 3320.0, 2980.0, 3230.0, 2730.0, 2850.0, 3240.0, 3000.0, 2950.0, 3190.0, 2390.0, 2660.0, 2670.0, 3320.0, 3240.0, 2940.0, 2750.0, 3410.0, 3560.0, 2920.0, 2820.0, 3080.0, 2740.0, 2990.0, 3530.0, 2610.0, 3530.0, 3940.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            },
            {
                label: "Particionamiento hash",
                data: [1.9, 1.0, 0.9, 0.8, 826.0, 1670.0, 1360.0, 1470.0, 1130.0, 1600.0, 1300.0, 1530.0, 1510.0, 1400.0, 1350.0, 991.0, 1620.0, 1480.0, 1350.0, 1500.0, 1570.0, 1680.0, 1320.0, 1540.0, 1950.0, 2240.0, 2220.0, 1970.0, 2060.0, 2050.0, 2180.0, 2070.0, 2070.0, 2040.0, 1960.0, 1550.0, 2310.0, 1990.0, 2600.0, 2370.0, 2050.0, 2540.0, 2009.9999999999998, 2930.0, 2090.0, 2970.0, 2490.0, 1770.0, 2360.0, 1980.0, 1320.0, 2610.0, 2740.0, 2340.0, 2670.0, 3110.0, 2860.0, 2770.0, 3130.0, 3190.0, 2910.0, 2960.0, 2750.0, 2750.0, 3140.0, 2920.0, 2850.0, 3080.0, 2400.0, 2600.0, 2630.0, 3240.0, 3140.0, 2840.0, 2640.0, 3290.0, 3630.0, 2860.0, 2690.0, 2900.0, 2720.0, 2900.0, 3340.0, 2560.0, 3420.0, 3840.0],
                borderColor: "rgb(75, 192, 192)",
                tension: 0.4
            },
            {
                label: "Fillfactor 50",
                data: [2.0, 1.0, 0.9, 0.8, 804.0, 1740.0, 1620.0, 1530.0, 1050.0, 1270.0, 1090.0, 1300.0, 1330.0, 1170.0, 1040.0, 739.0, 1590.0, 1360.0, 1260.0, 1450.0, 1430.0, 1530.0, 1210.0, 1280.0, 1630.0, 1980.0, 2040.0, 1770.0, 1950.0, 1860.0, 2029.9999999999998, 1830.0, 1890.0, 1940.0, 1650.0, 1390.0, 2060.0, 1760.0, 2280.0, 2070.0, 1860.0, 2230.0, 1730.0, 2570.0, 1820.0, 2610.0, 2170.0, 1510.0, 2050.0, 1770.0, 1130.0, 2290.0, 2340.0, 2000.0, 2300.0, 2680.0, 2450.0, 2360.0, 2700.0, 2730.0, 2470.0, 2620.0, 2370.0, 2300.0, 2770.0, 2500.0, 2350.0, 2670.0, 2100.0, 2270.0, 2280.0, 2810.0, 2740.0, 2470.0, 2300.0, 2860.0, 3120.0, 2520.0, 2390.0, 2570.0, 2350.0, 2550.0, 3000.0, 2240.0, 2960.0, 3340.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Comparación de TPS"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "TPS"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Tasa de actualizaciones

Actualizaciones por segundo registradas. Las variantes predeterminada y particionada por hash se mantienen próximas, mientras que la de fillfactor reducido suele quedar por debajo.

{{< chart >}}
        const data = {
            labels: ['20:47:00', '20:47:20', '20:47:40', '20:48:00', '20:48:20', '20:48:40', '20:49:00', '20:49:20', '20:49:40', '20:50:00', '20:50:20', '20:50:40', '20:51:00', '20:51:20', '20:51:40', '20:52:00', '20:52:20', '20:52:40', '20:53:00', '20:53:20', '20:53:40', '20:54:00', '20:54:20', '20:54:40', '20:55:00', '20:55:20', '20:55:40', '20:56:00', '20:56:20', '20:56:40', '20:57:00', '20:57:20', '20:57:40', '20:58:00', '20:58:20', '20:58:40', '20:59:00', '20:59:20', '20:59:40', '21:00:00', '21:00:20', '21:00:40', '21:01:00'],
            datasets: [{
                label: "Predeterminada",
                data: [0.0, 0.0, 856.0, 1690.0, 1520.0, 1460.0, 1480.0, 1230.0, 1350.0, 1430.0, 1530.0, 1460.0, 1820.0, 2070.0, 2000.0, 2040.0, 2050.0, 1840.0, 1940.0, 2330.0, 2350.0, 2550.0, 2680.0, 2460.0, 2090.0, 2060.0, 2600.0, 2770.0, 2970.0, 3120.0, 3170.0, 2940.0, 3030.0, 3050.0, 2750.0, 2880.0, 3170.0, 3030.0, 3290.0, 2940.0, 2940.0, 3040.0, 3360.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            },
            {
                label: "Particionamiento hash",
                data: [0.0, 0.0, 803.0, 1500.0, 1400.0, 1470.0, 1480.0, 1250.0, 1360.0, 1440.0, 1590.0, 1510.0, 1910.0, 2140.0, 2029.9999999999998, 2100.0, 2060.0, 1850.0, 1950.0, 2320.0, 2320.0, 2490.0, 2660.0, 2410.0, 2029.9999999999998, 1970.0, 2570.0, 2710.0, 2910.0, 3030.0, 3020.0, 2820.0, 2940.0, 2950.0, 2690.0, 2820.0, 3070.0, 2920.0, 3260.0, 2820.0, 2840.0, 2930.0, 3270.0],
                borderColor: "rgb(75, 192, 192)",
                tension: 0.4
            },
            {
                label: "Fillfactor 50",
                data: [0.0, 0.0, 817.0, 1630.0, 1280.0, 1220.0, 1270.0, 981.0, 1230.0, 1360.0, 1470.0, 1340.0, 1630.0, 1930.0, 1860.0, 1900.0, 1880.0, 1660.0, 1740.0, 2040.0, 2050.0, 2170.0, 2330.0, 2090.0, 1780.0, 1730.0, 2210.0, 2330.0, 2500.0, 2590.0, 2610.0, 2430.0, 2520.0, 2500.0, 2350.0, 2450.0, 2670.0, 2540.0, 2830.0, 2490.0, 2490.0, 2590.0, 2850.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Tasa de actualizaciones"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Actualizaciones/s"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Total de búferes en caché

Recuentos de búferes de las variantes predeterminada y con fillfactor reducido. La diferencia de aproximadamente 7,5× aparece hacia el final, no durante toda la ejecución. Sin la consulta de recolección, no se puede precisar qué relaciones y forks están incluidos.

{{< chart >}}
        const data = {
            labels: ['20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '20:59:00', '20:59:10', '20:59:20', '20:59:30', '20:59:40', '20:59:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50'],
            datasets: [{
                label: "Fillfactor 50",
                data: [9952.0, 26273.0, 37919.0, 48347.0, 55323.0, 50891.0, 43759.0, 52471.0, 52609.0, 50427.0, 51648.0, 53183.0, 54771.0, 56483.0, 58618.0, 59863.0, 61069.0, 62112.0, 62661.0, 62980.0, 63848.0, 65437.0, 66872.0, 67823.0, 68758.0, 69441.0, 69347.0, 68296.0, 68413.0, 68936.0, 69354.0, 69774.0, 70231.0, 70680.0, 70769.0, 70989.0, 71262.0, 71878.0, 72082.0, 72610.0, 72927.0, 72985.0, 73365.0, 73791.0, 73921.0, 74081.0, 74120.0, 74388.0, 74697.0, 74801.0, 75005.0, 75257.0, 75299.0, 75425.0, 75567.0, 75788.0, 76160.0, 76548.0, 76794.0, 76935.0, 77085.0, 77158.0, 77210.0, 77192.0, 77233.0, 77486.0, 77722.0, 77811.0, 77969.0, 77972.0, 78070.0, 78357.0, 78344.0, 78592.0, 78640.0, 78699.0, 78827.0, 78832.0, 78643.0, 78767.0, 78571.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            },
            {
                label: "Predeterminada",
                data: [9323.0, 26196.0, 37522.0, 47462.0, 54571.0, 53956.0, 50616.0, 51359.0, 51776.0, 51802.0, 50701.0, 48855.0, 46875.0, 46704.0, 46589.0, 46567.0, 46859.0, 46574.0, 44732.0, 42854.0, 41662.0, 40635.0, 39716.0, 38637.0, 37415.0, 36299.0, 35170.0, 34163.0, 33254.0, 31983.0, 31138.0, 30315.0, 29322.0, 28535.0, 27499.0, 26500.0, 25663.0, 24743.0, 23919.0, 22778.0, 22004.0, 21189.0, 20297.0, 19727.0, 19056.0, 18641.0, 18342.0, 17628.0, 17083.0, 16705.0, 16144.0, 15537.0, 15120.0, 14723.0, 14260.0, 13845.0, 13498.0, 13104.0, 12913.0, 12672.0, 12303.0, 12177.0, 12030.0, 11881.0, 11815.0, 11616.0, 11466.0, 11290.0, 11161.0, 11103.0, 10990.0, 10909.0, 10758.0, 10675.0, 10710.0, 10681.0, 10607.0, 10551.0, 10529.0, 10521.0, 10527.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Total de búferes en caché"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Búferes"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Búferes sucios en caché

Los recuentos de búferes sucios divergen en la parte final. Un conjunto grande de páginas sucias puede indicar trabajo de escritura pendiente, pero su tamaño por sí solo no demuestra un cuello de botella en el almacenamiento.

{{< chart >}}
        const data = {
            labels: ['20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '20:59:00', '20:59:10', '20:59:20', '20:59:30', '20:59:40', '20:59:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50'],
            datasets: [{
                label: "Fillfactor 50",
                data: [9952.0, 26273.0, 8613.0, 21908.0, 30766.0, 18860.0, 15327.0, 26532.0, 36573.0, 9962.0, 18985.0, 27313.0, 40417.0, 16850.0, 21894.0, 34131.0, 44029.0, 42737.0, 14259.0, 27997.0, 42918.0, 56731.0, 48878.0, 20757.0, 39564.0, 54115.0, 63084.0, 65078.0, 66807.0, 68476.0, 53293.0, 40326.0, 33945.0, 45072.0, 59534.0, 64500.0, 67790.0, 70505.0, 71480.0, 72528.0, 72906.0, 72597.0, 65736.0, 56040.0, 49761.0, 49537.0, 51311.0, 59178.0, 65267.0, 69256.0, 72720.0, 74364.0, 74995.0, 75358.0, 75566.0, 75718.0, 76155.0, 76487.0, 76767.0, 76931.0, 77080.0, 77151.0, 77205.0, 74934.0, 66621.0, 63348.0, 63867.0, 67757.0, 69769.0, 71305.0, 73572.0, 75181.0, 76278.0, 76824.0, 77559.0, 78198.0, 78514.0, 78732.0, 78613.0, 78754.0, 78519.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            },
            {
                label: "Predeterminada",
                data: [9322.0, 26110.0, 37462.0, 27632.0, 30358.0, 40802.0, 43859.0, 22646.0, 34248.0, 41918.0, 44948.0, 21092.0, 29626.0, 36204.0, 42177.0, 32114.0, 31649.0, 37113.0, 39343.0, 39595.0, 24339.0, 29119.0, 33676.0, 35220.0, 35492.0, 32815.0, 27299.0, 28757.0, 29690.0, 29916.0, 29648.0, 29220.0, 28496.0, 27763.0, 26770.0, 25765.0, 23520.0, 21779.0, 21544.0, 21255.0, 20890.0, 20185.0, 19628.0, 19120.0, 18505.0, 18113.0, 17858.0, 17195.0, 16676.0, 16332.0, 15806.0, 15220.0, 14412.0, 13674.0, 13323.0, 13219.0, 13108.0, 12881.0, 12748.0, 12558.0, 12209.0, 12086.0, 11943.0, 11808.0, 11746.0, 11566.0, 11419.0, 11248.0, 11119.0, 11025.0, 10957.0, 10879.0, 10742.0, 10652.0, 10692.0, 10673.0, 10596.0, 10542.0, 10520.0, 10515.0, 10510.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Búferes sucios en caché"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Búferes"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Aciertos de bloques de índice (statio)

Aciertos de caché registrados para el índice de clave primaria. Los valores más bajos no son necesariamente mejores: las variantes completan distintas cantidades de trabajo y se necesita conocer la transformación del exportador para interpretar la unidad con precisión.

{{< chart >}}
        const data = {
            labels: ['20:47:20', '20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '20:59:00', '20:59:10', '20:59:20', '20:59:30', '20:59:40', '20:59:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50'],
            datasets: [{
                label: "Fillfactor 50 (clave primaria)",
                data: [0.0, 632.0, 1958.0, 3171.0, 3752.0, 3313.0, 3073.0, 2799.0, 2889.0, 2964.0, 2931.0, 2778.0, 2438.0, 2780.0, 2932.0, 3282.0, 3183.0, 3359.0, 3536.0, 3399.0, 3398.0, 3623.0, 4248.0, 4591.0, 4592.0, 4555.0, 4619.0, 4852.0, 4795.0, 4704.0, 4666.0, 4502.0, 4279.0, 4379.0, 4394.0, 5077.0, 4989.0, 5128.0, 5054.0, 4982.0, 5627.0, 5352.0, 5563.0, 5380.0, 5125.0, 5086.0, 4446.0, 4203.0, 4495.0, 5001.0, 5539.0, 5630.0, 5906.0, 6184.0, 6228.0, 6436.0, 6724.0, 6671.0, 6623.0, 6413.0, 6275.0, 6321.0, 6470.0, 6353.0, 6281.0, 5944.0, 5979.0, 5640.0, 6203.0, 6543.0, 6536.0, 6376.0, 6691.0, 7424.0, 7324.0, 6755.0, 6401.0, 6262.0, 6527.0, 6747.0, 6701.0, 7125.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            },
            {
                label: "Predeterminada (clave primaria)",
                data: [0.0, 1526.0, 4705.0, 7321.0, 8350.0, 7202.0, 6657.0, 6062.0, 5947.0, 5978.0, 5785.0, 5498.0, 4756.0, 5110.0, 5202.0, 5676.0, 5454.0, 7235.0, 7270.0, 6922.0, 5138.0, 5443.0, 6310.0, 6875.0, 6791.0, 6626.0, 6497.0, 6786.0, 6649.0, 6512.0, 6445.0, 6215.0, 5900.0, 5976.0, 6023.0, 6913.0, 6943.0, 7122.0, 7095.0, 6842.0, 7740.0, 7450.0, 7687.0, 7474.0, 6952.0, 6911.0, 5988.0, 5706.0, 6195.0, 6910.0, 7658.0, 7762.0, 8264.0, 8567.0, 8573.0, 8769.0, 9247.0, 9137.0, 8924.0, 8604.0, 8485.0, 8579.0, 8897.0, 8746.0, 8632.0, 7998.0, 7948.0, 7513.0, 8258.0, 8707.0, 8610.0, 8418.0, 8877.0, 9718.0, 9514.0, 8675.0, 8303.0, 8160.0, 8493.0, 8799.0, 8741.0, 9358.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Aciertos de bloques de índice (statio)"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Aciertos de bloques"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Actualizaciones HOT por tabla

Actividad HOT registrada para cada tabla. Para comparar su eficiencia, calcula el porcentaje HOT con muestras del total de actualizaciones correspondientes al mismo intervalo, en lugar de evaluar este gráfico de forma aislada.

{{< chart >}}
        const data = {
            labels: ['20:47:20', '20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '20:59:00', '20:59:10', '20:59:20', '20:59:30', '20:59:40', '20:59:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50'],
            datasets: [{
                label: "Fillfactor 50",
                data: [0.0, 291.0, 852.0, 1334.0, 1625.0, 1394.0, 1290.0, 1182.0, 1216.0, 1242.0, 1227.0, 1164.0, 1021.0, 1164.0, 1225.0, 1365.0, 1312.0, 1376.0, 1444.0, 1388.0, 1387.0, 1477.0, 1729.0, 1865.0, 1863.0, 1844.0, 1867.0, 1956.0, 1928.0, 1889.0, 1872.0, 1806.0, 1714.0, 1748.0, 1751.0, 2022.0, 1988.0, 2041.0, 2011.0, 1978.0, 2234.0, 2126.0, 2210.0, 2135.0, 2031.0, 2015.0, 1762.0, 1664.0, 1778.0, 1976.0, 2189.0, 2222.0, 2330.0, 2441.0, 2456.0, 2537.0, 2649.0, 2629.0, 2608.0, 2523.0, 2469.0, 2487.0, 2545.0, 2497.0, 2468.0, 2333.0, 2347.0, 2212.0, 2453.0, 2561.0, 2559.0, 2475.0, 2620.0, 2905.0, 2865.0, 2639.0, 2500.0, 2446.0, 2551.0, 2637.0, 2618.0, 2786.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            },
            {
                label: "Predeterminada",
                data: [0.0, 9.38, 101.0, 239.0, 418.0, 527.0, 592.0, 626.0, 693.0, 772.0, 814.0, 814.0, 744.0, 833.0, 890.0, 1010.0, 953.0, 813.0, 861.0, 897.0, 1114.0, 1222.0, 1460.0, 1631.0, 1658.0, 1667.0, 1683.0, 1798.0, 1799.0, 1793.0, 1806.0, 1768.0, 1698.0, 1745.0, 1776.0, 2061.0, 2093.0, 2163.0, 2173.0, 2113.0, 2406.0, 2332.0, 2415.0, 2363.0, 2208.0, 2204.0, 1915.0, 1829.0, 1997.0, 2241.0, 2490.0, 2537.0, 2722.0, 2834.0, 2854.0, 2929.0, 3103.0, 3076.0, 3017.0, 2920.0, 2889.0, 2928.0, 3042.0, 2994.0, 2960.0, 2751.0, 2740.0, 2601.0, 2858.0, 3018.0, 2987.0, 2924.0, 3083.0, 3381.0, 3337.0, 3031.0, 2901.0, 2832.0, 2971.0, 3082.0, 3065.0, 3282.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Actualizaciones HOT por tabla"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Actualizaciones HOT"
                        }
                    }
                }
            }
        });
{{< /chart >}}

### Tuplas muertas por tabla

Estimación de tuplas muertas de cada tabla. El momento de la limpieza y el número de actualizaciones completadas afectan a esta comparación. La serie proporcionada también tiene un salto temporal entre las 20:58:50 y las 21:00:00.

{{< chart >}}
        const data = {
            labels: ['20:47:20', '20:47:30', '20:47:40', '20:47:50', '20:48:00', '20:48:10', '20:48:20', '20:48:30', '20:48:40', '20:48:50', '20:49:00', '20:49:10', '20:49:20', '20:49:30', '20:49:40', '20:49:50', '20:50:00', '20:50:10', '20:50:20', '20:50:30', '20:50:40', '20:50:50', '20:51:00', '20:51:10', '20:51:20', '20:51:30', '20:51:40', '20:51:50', '20:52:00', '20:52:10', '20:52:20', '20:52:30', '20:52:40', '20:52:50', '20:53:00', '20:53:10', '20:53:20', '20:53:30', '20:53:40', '20:53:50', '20:54:00', '20:54:10', '20:54:20', '20:54:30', '20:54:40', '20:54:50', '20:55:00', '20:55:10', '20:55:20', '20:55:30', '20:55:40', '20:55:50', '20:56:00', '20:56:10', '20:56:20', '20:56:30', '20:56:40', '20:56:50', '20:57:00', '20:57:10', '20:57:20', '20:57:30', '20:57:40', '20:57:50', '20:58:00', '20:58:10', '20:58:20', '20:58:30', '20:58:40', '20:58:50', '21:00:00', '21:00:10', '21:00:20', '21:00:30', '21:00:40', '21:00:50'],
            datasets: [{
                label: "Fillfactor 50",
                data: [0.0, 9104.0, 25081.0, 37192.0, 47795.0, 54960.0, 62325.0, 68928.0, 75097.0, 81305.0, 86320.0, 90526.0, 94056.0, 100040.0, 104513.0, 109261.0, 114187.0, 119005.0, 123842.0, 127796.0, 131972.0, 137042.0, 142589.0, 147547.0, 152361.0, 157416.0, 117100.0, 121576.0, 125153.0, 128385.0, 131619.0, 134015.0, 136050.0, 138557.0, 140360.0, 142556.0, 144399.0, 145881.0, 147430.0, 148693.0, 150251.0, 151212.0, 152217.0, 153142.0, 153693.0, 154411.0, 154933.0, 155299.0, 155907.0, 156439.0, 156814.0, 157288.0, 157703.0, 158027.0, 158336.0, 158659.0, 158904.0, 159107.0, 159304.0, 159477.0, 159614.0, 159745.0, 159851.0, 159962.0, 160060.0, 160130.0, 160196.0, 160261.0, 160330.0, 160384.0, 160420.0, 160436.0, 160472.0, 160528.0, 160551.0, 160573.0],
                borderColor: "rgb(54, 162, 235)",
                tension: 0.4
            },
            {
                label: "Predeterminada",
                data: [0.0, 9130.0, 27262.0, 41050.0, 53716.0, 63186.0, 72362.0, 80635.0, 88370.0, 96248.0, 102556.0, 108059.0, 112565.0, 119349.0, 124461.0, 129562.0, 41304.0, 116834.0, 121407.0, 124892.0, 128521.0, 132936.0, 137472.0, 141483.0, 144941.0, 148375.0, 151428.0, 154672.0, 157301.0, 159534.0, 162054.0, 164056.0, 165664.0, 167913.0, 169424.0, 171338.0, 173165.0, 174625.0, 176358.0, 177797.0, 179662.0, 180996.0, 182359.0, 183849.0, 184664.0, 185895.0, 186715.0, 187315.0, 188585.0, 189672.0, 190579.0, 191676.0, 192540.0, 193325.0, 194179.0, 194975.0, 195709.0, 196143.0, 196705.0, 197196.0, 197661.0, 198223.0, 198644.0, 199053.0, 199356.0, 199652.0, 199858.0, 200087.0, 200413.0, 200577.0, 200791.0, 201096.0, 201347.0, 201524.0, 201751.0, 201912.0],
                borderColor: "rgb(255, 99, 132)",
                tension: 0.4
            }]
        };

        new Chart(document.getElementById("chart"), {
            type: "line",
            data: data,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Tuplas muertas por tabla"
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Hora"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Tuplas muertas"
                        }
                    }
                }
            }
        });
{{< /chart >}}

## Qué probaría a continuación

Para determinar si este resultado se mantiene fuera del entorno local con Docker, el siguiente experimento debería separar los cambios de configuración y controlar el entorno:

1. **Aislar las ejecuciones.** Probar una variante a la vez en un equipo dedicado sin otras cargas, o en un entorno controlado equivalente. Registrar los límites de CPU y memoria de Docker, el tipo de volumen, los recursos del equipo y si el generador de carga comparte equipo con la base de datos.
2. **Cambiar un parámetro a la vez.** Comparar la configuración predeterminada con cambios de fillfactor solo en la tabla y, después, solo en el índice. Probar valores menos agresivos para la tabla, como 90, 80 y 70, antes de asumir que 50 es adecuado. Crear cada variante a partir de un conjunto de datos inicial equivalente y con la distribución física prevista.
3. **Repetir y variar el orden.** Utilizar intervalos consistentes de calentamiento y medición, repetir cada configuración e informar de la variación entre ejecuciones. Ampliar la ventana de medición para observar ciclos de checkpoint y autovacuum, en lugar de depender de un valor final.
4. **Medir el coste por unidad de trabajo.** Registrar percentiles de latencia, transacciones completadas, bytes de WAL, tiempos de E/S, actividad de checkpoints, tamaños de las relaciones y porcentajes HOT por intervalo. Agregar las estadísticas de todas las particiones hoja al comparar la tabla particionada con la no particionada.
5. **Publicar los detalles para reproducir la prueba.** Incluir la etiqueta o el digest de la imagen, la salida de `SELECT version()`, el DDL, las consultas de carga y monitorización, la clave y el número de particiones, la concurrencia y los parámetros relevantes del servidor.

## Conclusión

En esta ejecución local con Docker, el esquema predeterminado ofreció un mayor rendimiento que la configuración con fillfactor 50 tanto en la tabla como en el índice, mientras que el particionamiento hash se comportó de forma similar al esquema predeterminado. El fillfactor reducido mostró más actividad HOT al principio, pero un uso de búferes mucho mayor en la parte final.

Es una observación útil para seguir investigando, no una recomendación general contra la reducción del fillfactor. Una conclusión definitiva para esta carga requiere mediciones repetidas, separando los cambios de configuración y controlando las interferencias del entorno; puede ser necesario un entorno aislado para establecer si la diferencia observada es reproducible.
