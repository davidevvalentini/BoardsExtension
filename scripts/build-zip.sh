#!/bin/sh
# Crea boards-extension-<versione>.zip con i soli file dell'estensione (niente .git, docs, tests, README).
set -e
cd "$(dirname "$0")/.."
v=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' manifest.json | head -1)
out="${1:-boards-extension-$v.zip}"
rm -f "$out"
zip -qr "$out" . -x '.git/*' '.gitignore' 'README.md' 'docs/*' 'tests/*' 'scripts/*' '.superpowers/*' '*.zip'
echo "$out"
