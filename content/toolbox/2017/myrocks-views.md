---
title: "MyRocks Views"
subtitle: "Extending the current catalogs for MyRocks"
excerpt: ""
date: 2017-01-21
draft: false
tags:
  - MySQL
  - RocksDB
---

![MyRocks](/images/posts/myRocks.png)

[MyRocks][1] is an storage engine available also in MongoDB, focused on performance
and space saving. It is a LSM tree, with Bloom filtering for unique keys, providing
steady performance in limited amount of cache. Installing can be done through
a 5.6 fork, [repository here][3].

Installing is easy as importing the sql file into your database.

Repository can be found [here][2]. What's inside?

- SQL    

---

[1]: http://myrocks.io/
[2]: https://github.com/3manuek/myrocks_views
[3]: https://github.com/facebook/mysql-5.6