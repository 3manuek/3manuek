---
title: "Earthly feature --allow-without-earthly-labels"
subtitle: "Reproducibility in Earthly produced images"
date: 2024-07-01
author: "3manuek"
draft: false
series: "Earthly"
tags:
  - Earthly
  - Docker
  - Go
---


## What does labels do to reproducible builds?

By default, Earthly adds `dev.earthly.*` labels in the built image, as follows:

```json
    "Config": {
        ...
        "Labels": {
            "dev.earthly.built-by": "homebrew",
            "dev.earthly.git-sha": "6b41f8409d7ffef0d25072c2c04250074b6e3c72",
            "dev.earthly.version": "v0.8.14",
            ...
        }
    }
```

> You can read more information in the [issue][2].

Even tho these labels are important in terms of information, certain use-cases
require including this information (or not) in its own label domain. Labels impact
on the build reproducibility, cause it _changes the produced hashes_ of the images,
leading to potentially duplicated images.

If you build an image that contains exactly the same binaries, but your Earthly version
changes (even if you still have unchanged VERSION in the Earthfiles), this changes the 
checksum. There are image registry implementations that can handle this with a different
mechanism, by avoiding to push duplicated hashes.

By stripping out the labels, we can have full control through our custom domain labels,
and avoid duplicated artifacts to be pushed upstream.

That's why I proposed the [flag --allow-without-earthly-labels][3].

## How the Earthly feature works

From Earthly [v0.8.10][1], the `--allow-without-earthly-labels` feature flag has been added.
_This has not been yet updated in the Earthly documentation, but I'm pretty sure it will be soon
(and I'll update this post accordingly)_.

The way to use is as follows:

```sh
    VERSION --allow-without-earthly-labels 0.8
    # Enable with the VERSION `--allow-without-earthly-labels` feature flag.
    ...
    SAVE IMAGE --push --without-earthly-labels ....
    # Add the --without-earthly-labels flag to the SAVE IMAGE command.
```

Thanks for reading!



[1]: https://github.com/earthly/earthly/releases/tag/v0.8.10
[2]: https://github.com/earthly/earthly/issues/4069
[3]: https://github.com/earthly/earthly/pull/4084