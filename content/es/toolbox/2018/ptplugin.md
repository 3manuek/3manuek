---
title: "Start pt-stalk with delay"
subtitle: "Plugin for Percona's Toolkit pt-stalk"
date: 2018-12-12
layout: single
tags:
    - Plugin
    - pt-stalk
    - MySQL
---

> [Source](https://github.com/3manuek/start_after_N_seconds)

This plugin was developed for addressing one of Percona's customer issues, in which a custom process was _runtime error'ing_ after a frequent amount of time.

`pt-stalk` name is self-explanatory, so this tool started the debug collection after a period of time to avoid unnecesary logs -- the _stalking_ output can be extremelly large and impactful for the database throughput.

