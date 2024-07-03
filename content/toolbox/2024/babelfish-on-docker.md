---
title: "Babelfish for Postgres Docker Images"
subtitle: "BabelfishPG Docker Images generator."
excerpt: ""
date: 2024-06-30
author: "3manuek"
draft: false

series: "BabelfishPG"
tags:
  - Projects
  - BabelfishPG
  - Postgres
  - Docker
# layout options: single or single-sidebar
layout: single

---

### Description

> Repository: [babelfish-on-docker](https://github.com/ongres/babelfish-on-docker)

Babelfish for Postgres is a slightly-modified Postgres distribution that provides
extensions for supporting TDS protocol and T-SQL language.

I'm updating the generated images with the latest releases, plus adding a basic
dockerization for the `tdspool` utility, for setting up a pool for the TDS connections.