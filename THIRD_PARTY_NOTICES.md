# Third-party notices

## Cukup design CSS

`app/design/kawal.css` adapts the paper-and-ink design from
`service/dashboard/dashboard.css` in
[Cukup at the referenced revision](https://github.com/zainfathoni/cukup/commit/903a4e137c44e7513bc32365ca9571704d90f7cb).
The [upstream license](https://github.com/zainfathoni/cukup/blob/903a4e137c44e7513bc32365ca9571704d90f7cb/LICENSE)
is reproduced in the [public notice file](apps/public/public/third-party-notices.txt)
and the [app notice file](apps/app/public/third-party-notices.txt). Both targets
use the adapted CSS. Each build copies its notice into `dist/client`.
Keep it with distributed output: CSS compilation removes comments. Keep this
source index and the full notice with source copies too.

## three.js

The `/rancangan/d` 3D design-review prototype bundles
[three.js](https://github.com/mrdoob/three.js) 0.186.1 under the MIT License. The
public build loads it only on that page. Its license is reproduced in the
[public notice file](apps/public/public/third-party-notices.txt). Keep the
notice with distributed output.

## Installed dependencies

Dependencies keep their own licenses. This file is not a complete notice file
for every possible build or binary distribution. Before distributing a bundle,
review the included dependency licenses and retain their required notices,
source offers, or other obligations. Do not assume that this project's chosen
license replaces third-party terms. In particular, the installed dependency
tree includes LGPL libvips and MPL Lightning CSS packages; their inclusion and
obligations depend on what is distributed.
