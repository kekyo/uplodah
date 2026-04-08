#!/bin/sh

set -eu

#------------------------------------------------------

git clean -xfd
npm install

VERSION=`npx screw-up dump | jq -r '.version'`

echo "Build deployment artifacts: $VERSION"

#------------------------------------------------------

npm run test
npm run pack

#------------------------------------------------------

./build-docker-multiplatform.sh --skip-app-build

#------------------------------------------------------

#npm publish ./artifacts/uplodah-$VERSION.tgz
#podman manifest push uplodah:$VERSION docker://docker.io/kekyo/uplodah:$VERSION
#podman manifest push uplodah:latest docker://docker.io/kekyo/uplodah:latest
