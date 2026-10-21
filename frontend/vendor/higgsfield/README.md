# Higgsfield CLI (bundled)

`hf` — official Higgsfield CLI, linux/amd64, v1.2.2.

Source: https://github.com/higgsfield-ai/cli/releases/download/v1.2.2/hf_1.2.2_linux_amd64.tar.gz
SHA-256: 6a642f61f409a00d724de3079c1a7a25777eb1e49a2e0c3814e8a6ea3f49bb51 (matches the npm
package's published `checksums.json` for this release)

Used by `app/api/articles/[id]/generate-images/route.ts` to submit Ultra Plan generation
jobs — Higgsfield's job-submission API rejects a bare bearer token and requires additional
undocumented headers that only the official client sets correctly, so that route runs this
binary as a subprocess instead of calling the API directly.

To update: download the new version's `hf_<version>_linux_amd64.tar.gz` from the CLI's
GitHub releases, verify its SHA-256 against the matching `checksums.json` published with the
`@higgsfield/cli` npm package, replace this binary, and update this file.
