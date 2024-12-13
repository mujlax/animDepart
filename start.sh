#!/bin/bash
cd "$(dirname "$0")"
git reset --hard
git pull
npm run package-intel
