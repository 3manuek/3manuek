---
title: "Using parallel with multiple arguments"
subtitle: "The beauty of parallel"
date: 2024-04-01
author: "3manuek"
draft: false
series: "Bash"
tags:
  - Bash
  - Parallel
---



## A handy tool for parallelization

If you are reading this post, is because you have heard about `parallel`. It is a GNU developed tool for 
paralelizing commands across sets of arguments. I'll be honest, I use to forget about its existence until
I need to do quick and dirty things when dealing with tasks that require paralelization, and whenever time
is a constraint.

It has plenty of options and arguments, although once you get up on its usage, it is very handy in many 
cases.

## My case

One of the projects I've been working on lately, is about building OCI images based on distroless components.
The amount of generated images is considerably high, counting as of today about 2k images pushed. Let's say
that they are layers instead of images by themselves, as there is a chain dependency to make a final functional
image.

The problem was how I could check the image information across the Github API. So, I build a script that went
through all the existing containers (that's how GH calls the images) across several pages. 

My initial take was simple: extract the name of the image, the id , parse and do variable substitution for
scrapping and storing the image information. The whole process was taking **12 minutes** to run, something was
definitively odd and unacceptable. I used Codeium to refactor the code and the produced output didn't convinced me that much, 
as it was a complex version of the old code (I guess that's the price of LLMs).

I used parallel in the past, but this case was different, as arguments were not a combination, they were rows of information of each image version.

The full execution with parallel took around **6 minutes** to run, and consider that I stick to just 4 jobs at a time
-- I was on the edge of the API quota. 


## Addressing the problem using JSON (jq) and parallel

The below snippet is a part of a function called `index_container_pages` which is a simple extraction of the needed information to scrape image version from the API.

```bash
  jq -r  '.[] | {id: .id , name: .name , url: .url} | @json' \
    $(get_container_pages) > ${OUTDIR}/paramix.json
```
The `get_container_pages` is a function that just returns all the downloaded pages from the registry. Consider
that we are talking about around 3k images (containers, OK Github), so this is returning around +30 pages of 
JSON files. Within the above command, I was able to combine them all into a the JSON file that serves as 
parameters for the `parallel` command.

This generated file is the argument list that we are going to use forward to parametrize `parallel`.

The code inside the script, ended up looking like this:


```bash
  HEADER="curl -s -L -H \"Accept: application/vnd.github+json\" \
        -H \"Authorization: Bearer ${GH_TOKEN}\" \
        -H \"X-GitHub-Api-Version: 2022-11-28\""
   
  parallel --progress --colsep '\t' -j4 \
    '[ ! -d '''${OUTDIR}'''/{2} ] && { mkdir -p '''${OUTDIR}'''/{2} ; } ; \
    '''${HEADER}''' \
        {1} > '''${OUTDIR}'''/{2}/{3}.json ; sleep 0.1' \
     :::: <(jq -r '. | "\(.url)\t\(.name)\t\(.id)"' ${OUTDIR}/paramix.json) 

  parallel --progress --colsep '\t' -j4 \
    ''''${HEADER}''' \
        {1}/versions > '''${OUTDIR}'''/{2}/versions.json ; sleep 0.1' \
     :::: <(jq -r '. | "\(.url)\t\(.name)"' ${OUTDIR}/paramix.json) 
```

- HEADER is just a Macro of the `curl` command.
- Those variables using triple single quotes are those "constants", so we inject them directly into the `parallel` command.
  - _I know it looks weird to use triple-single quotes, but IMHO it is the best way to escape from quotes on the shell._ You can inject 
    whatever you have declared without falling into annoying back-slashes and is more consistent.
- The `::::` is the `parallel` equivalent of `while`, and we read the parameters from the `paramix.json`  in TSV format. You can use CSV too. In any case, this is controlled by `--colsep '\t'`.
- The `{1}`, `{2}` and `{3}` are the variables that we feed from the `jq` command. _Duh._
- The `sleep` isn't strictly necessary, but it controls better the case in which the iteration could be considered suspicious.
  - GH registry was complaining when I tried to issue the command with no sleep.
- The `name`, returns the name path of the image, so we use that exact name to create the local path.

You can even do better controling the parallelization with the `-j` flag by getting the factor of processing that you want to assign. Eg.:

```bash
-j $(expr $(nproc) / 2 + 1)
-j $(nproc)
```

Keep in mind that there are certain limitation regarding the amount of permitted requests across any API. Although, the above example can be used to process things locally.



## Other combinations

The parallel arguments can be basically controlled by `:::`, `:::+` and `::::` (which is the one we used above for taking arguments from a file). The `:::` just combines all the arguments, whether `:::+` forces a single execution for each argument.

```bash
parallel echo ::: 1 2 3 ::: A B C ::: T
1 A T
1 B T
1 C T
2 A T
2 B T
2 C T
3 A T
3 B T
3 C T
```

Now, suppose that I just want the combinations for `A B C` only, so I can use `:::+` to do a single iteration:

```bash
parallel echo ::: 1 2 3 :::+ A B C ::: T
1 A T
2 B T
3 C T

parallel echo ::: 1 2 3 ::: A B C :::+ T
1 A T
2 A T
3 A T
```

The rightmost arguments do have precedence over the leftmost arguments, so keep this in mind when building argument lists.

Thanks for reading!
