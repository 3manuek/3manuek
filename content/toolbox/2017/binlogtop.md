---
title: "binlogtop"
subtitle: "Top-like replication monitoring tool for MySQL."
excerpt: ""
date: 2017-01-23
author: "3manuek"
draft: false
series: "MySQL"
tags:
  - Projects
  - MySQL
  - Labs

---

Currently `binlogtop` is in _archived_ status and very alpha state, although there is a python
script doing sort of the same thing is: [binlogEventStats](https://github.com/3manuek/binlogEventStats).

This tool was used for debugging Binary Log bugs on large transactions that were split between more
than one log.

[binlogtop](https://github.com/3manuek/binlogTop) just do a real-time streaming statistics for helping
on these case detections.


What has inside?

- Golang
- Python

