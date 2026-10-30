# _"Biograffiti"_

My name is _Emanuel_, commonly named _Tresma_ -- the Spanish short of _3manuek_, my native language. I am a Database and Infrastructure Engineer from Argentina, currently living in Spain, Madrid. More information about my profile can be found at my [personal website](https://tr3s.ma).

I am a highly experienced Database Engineer and Consultant, currently working at [Workato](https://workato.com) as a _Staff Infrastructure Engineer_ in the Data Storage Team.

I've been involved in the design and development of highly-concurrent, available, and transactional systems. Also participated in several Open Source projects, not exclusively related to the database field. I've also provided consulting services to Software Teams dealing with complex storage-layer refactors, for analytics, transactional, integration, and search efficiency.


-- 

For inquiries or to review my resume, you can follow my [LinkedIn](https://www.linkedin.com/in/ecbcbcb/) profile.




## Website content and SEO

The homepage introductions live in `content/_index.md` and `content/es/_index.md`.
Curated reading paths live under each language's `guides/` directory. Keep the
English and Spanish versions aligned, linking only to published articles.

Set `description` in page front matter for a custom search/social summary. Other
pages fall back to a plain-text summary, then the language's site description.
The site-wide author identity is configured with `params.author`.

Math rendering is opt-in: add `math: true` to a page's front matter to load
KaTeX JavaScript and CSS. SQL dollar quoting does not need math rendering.

Build locally without modifying the checkout's generated output:

```sh
hugo --destination /tmp/tr3s-preview --environment production --minify
```
