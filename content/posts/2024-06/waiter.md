---
title: "Implementing a functional multi-process function in Bash"
subtitle: "Using only wait and jobs commands"
date: 2024-06-01
author: "3manuek"
draft: false
series: "Bash"
tags:
  - Bash
  - Concurrency
---


If you're in this post, is because you need to implement a consistent way to add concurrency to your scripts.
This implementation is limited, as it does not contemplates grouping jobs for setting different process
groups with different settings or priorities.

Although, probably most of the cases you just need to execute code that runs inside a block or just simply
does something in parallel. The `parallel` command is a good option, but it requires to loose some code readability,
particularly on code blocks that might inject a complex semantic.

You can start with this definition:

```bash
...
maxJobs=4
...

waiter(){
    while test $(jobs -p | wc -l) -ge $maxJobs ; do wait -n; done
}


waitall(){
  wait -n
}

```

The `waiter` function does the check that the current number of jobs spawned _currently_ by the process do not exceed
the `maxJobs` value using the standard [`wait`][2] call. 

The `wait -n` command waits the next job to terminate. This is for all the jobs that are running at that point in time.
Implementing a more elaborated approach for waiting by groups, would be storing the job id and use `wait -f ID` and coordinate
accordingly.

The `jobs -p` lists the IDs of the jobs, combined with just a plain `wc -l` that counts the list. If you happen to store those
IDs, it is possible to coordinate and configuring groups of jobs. Also, `jobs -n` allows you to list only those jobs that have
changed its status, as a message queue. Check the [man page][1] for more details.


The usage is simple, and relies on the concept of code blocks in base. You can use just simple commands too, but organizing
through bash blocks may encouraged.

```bash
    waiter
    (
        # operations ...
    ) &
    waitall # or wait -n
```

Here is an example implemented in a function. In this case I implement an iteration for spawning jobs, just for the sake of the
example:

```bash
function AFuncThatSpawnsSubProcesses() {
    for file in $(ls output/*.json)
    do
        # Worker initialization
        org=$(echo $file | grep -Po '(?<=_)[^_]+(?=_)')
        repo=$(echo $file | grep -Po '(?<=_)[^_]+(?=\.)')

        # Operation block
        waiter # Check and wait to a job release
        (
            someOutput=$(ExecuteSomethingInFunc $org $repo)
            ExecuteSomethingElseInFunc $someOutput
        ) &

    done
    waitall # wait the rest of jobs to finish
}

```

You can use a library style bash script like this [Gist](https://gist.github.com/3manuek/453e7dff8234da19057ad7c59e69eb3e) too.

```bash
. ./workers.sh
```


[1]: https://linuxcommand.org/lc3_man_pages/jobsh.html
[2]: https://linuxcommand.org/lc3_man_pages/waith.html