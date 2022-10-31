---
title: "What's happening in the Database World today?"
subtitle: "Trends and perspectives of what is going on on the ground."
excerpt: ""
date: 2019-07-18
author: "3manuek"
draft: true
images:
  - /blog/assets/thumbnail_db.png
  - /blog/assets/tachyons-logo-script-feature.png
series:
  - Getting Started
tags:
  - hugo-site
categories:
  - Theme Features
# layout options: single or single-sidebar
layout: single

---

## The broad trend


<blockquote class="twitter-tweet" data-lang="en"><p lang="en" dir="ltr">Exploring the trend towards open source database management systems<a href="https://t.co/KgxPD1hv4r">https://t.co/KgxPD1hv4r</a> <a href="https://t.co/ROW6JZeBAK">pic.twitter.com/ROW6JZeBAK</a> DB-Engines (@DBEngines) <a href="https://twitter.com/DBEngines/status/794184916892262400?ref_src=twsrc%5Etfw">November 3, 2016</a></p></blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>


## Who is dominating today?


https://db-engines.com/en/ranking

https://db-engines.com/en/ranking_osvsc

https://scalegrid.io/blog/2019-postgresql-trends-report-private-vs-public-cloud-migrations-database-combinations-top-reasons-used/

A popularity ranking shows 4th place for PG, but 2nd in Market Place. Even way ahead Oracle?

Well, Oracle may be not that _eating much market_ as seen [](https://www.macrotrends.net/stocks/charts/ORCL/oracle/revenue).

<!-- where is the post that shows datadog most pulled db was postgres? -->



## Are server-side languages underrated?

See, if we look the technologies in the playground, we'll see Postgres in the above the 3rd place (the link is external
it might change through time):

https://www.datanyze.com/market-share/databases

Although, `pl/pgSQL` does not apper in the [database management section](https://www.datanyze.com/market-share/database-management) which,
caught my attention, as it reminded me of a common pattern seen frequently during the last 3ish years: companies moving out Oracle into Postgres,
but also they take the logic back to the application. 

Certainly, in most cases customers were completely right, SP (from now on Store Procedures) blend into black magic tricks sometimes and,
they implement very complex business things and today, that is incompatible with the Micro Services philosophy. Besides - and not least -,
it means that a pipeline for testing database needs to be put in place, and code tracking on large organizations tends to be a jungle.
But, this is a pattern seen from Oracle to Postgres.

Even tho, it is rather a powerful feature of DBs, well used. That's why when you start fresh, with all your CI built, integrating SP code is 
easier nowadays. And Postgres, particularly, is very attractive in the matter of languages and weird things you can do. 




## Towards a Graph frameworks?

https://db-engines.com/en/blog_post/65

https://graphql.org/

