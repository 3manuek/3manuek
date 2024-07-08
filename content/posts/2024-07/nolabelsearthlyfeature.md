---
title: "[Earthly +v0.8.10 feature]: Disabling Earthly internal labels"
subtitle: "Reproducibility in Earthly images"
date: 2024-07-01
author: "3manuek"
draft: false
series: "Earthly"
tags:
  - Earthly
  - Docker
  - Go
---

> **NOTE:** _This has not been yet updated in the Earthly documentation, but I'm pretty sure it will be soon
(and I'll update this post accordingly)_

## What does labels do to reproducible builds?

By default, Earthly adds `dev.earthly.*` labels in the built image. You can find these
by doing a `docker inspect <imageID> | jq -r '.[].Config.Labels'`.

Here's an example of the image configuration including the `dev.earthly.*` labels:

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

You may probably infer what's the potential issue with these values.

If any of your execution environment, git-sha, or Earthly version changes, the
final image checksum changes. Even if the image contents are identically the same.

There are image registry implementations that can handle duplicated checksums with a different
mechanism, like avoiding to push duplicated images.

Even tho these labels are important in terms of information, certain use-cases
require including this information (or not) in its own label domain. Labels impact
on the build reproducibility, cause it _changes the produced hashes_ of the images,
leading to potentially duplicated images.

By stripping out the labels, we can have full control through our custom domain labels,
and avoid duplicated artifacts to be pushed upstream.


That's why the [flag --allow-without-earthly-labels][3] was proposed by the Earthly Team
and implemented by myself.


> You can read more information in the [issue][2].


## How this feature works?

From Earthly [v0.8.10][1], the `--allow-without-earthly-labels` feature flag has been added.

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