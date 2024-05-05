---
title: "Benchmark platform for Postgres/MongoDB"
date: 2020-11-01
layout: single
tags:
  - Postgres
  - MongoDB
  - Terraform
  - AWS
  - Python
---


> [Source Code](https://gitlab.com/ongresinc/benchplatform)

This project was a programatic benchmark comparision between Postgres and MongoDB on a single instance.
Filesystems used: XFS and ZFS. It also uses AWS SQS for notifying the status of each run.

It was coded using Terraform and AWS API. The analysis was conducted through Python Notebooks.

Relevant and published links:

- [Whitepaper](https://info.enterprisedb.com/rs/069-ALB-339/images/PostgreSQL_MongoDB_Benchmark-WhitepaperFinal.pdf)
- [Benchmark Post](https://www.ongres.com/blog/benchmarking-do-it-with-transparency/)
- [Results and Notebooks](https://gitlab.com/ongresinc/benchplatform/-/tree/master/notebook?ref_type=heads)

## Personal findings

- Postgres is faster than MongoDB on a single node when the _active dataset_ doesn't fit in memory.
- For datasets that fit in memory, MongoDB performs better, which is no surprise. Unless, you implement a Pooling
  layer.
- The MongoDB setup was slightly easier than Postgres. Although, less tunable options are available in MongoDB.
- Scaling Postgres requires a Pool layer, otherwise it will hit a performance bottleneck, unless you keep a low number
  of active connections. This can be persued through client pool, although you may need to reconfigure your applications
  to reduce the amount of connections if more backends added.
- Postgres consumes less CPU in all cases than MongoDB.

## Some examples of the collected results

The following shows the results of Mongo, Postgres, and PG+PGBouncer on XFS with 95% of reads and 5% writes:
![Fix XFS R95/W5%](/images/benchplatform/fit-xfs-pg-mg.png)

The following shows the results of Mongo, Postgres, and PG+PGBouncer on ZFS with 50/50 distribution:
![Non-fit ZFS 50/50](/images/benchplatform/zfs-5050-nonfit.png)