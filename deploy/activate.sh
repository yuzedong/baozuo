#!/usr/bin/env bash
set -euo pipefail

release=${1:?Missing release identifier}
[[ "$release" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
root=${BAOZUO_DEPLOY_ROOT:-/var/www/baozuo}
archive="$root/incoming/$release.tar.gz"
stage=$(mktemp -d "$root/releases/.incoming.XXXXXXXX")
link="$root/.current-$release"
trap 'rm -rf -- "$stage"; rm -f -- "$link" "$archive"' EXIT

tar --no-same-owner -xzf "$archive" -C "$stage"
test -s "$stage/index.html"
test -s "$stage/404.html"
test -s "$stage/catalog.json"
test -s "$stage/music/singles/index.html"
test -s "$stage/app.js"
chmod -R a+rX "$stage"
chmod 755 "$stage"

mv -T -- "$stage" "$root/releases/$release"
ln -s -- "releases/$release" "$link"
mv -Tf -- "$link" "$root/current"
printf 'Published %s\n' "$release"
