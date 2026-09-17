# Security reports

Do not post your Inception API key, `config.json`, installation manifests, patched bundles or backups in public issues. `config.json` contains the local bridge key.

For a sensitive vulnerability, use GitHub's private vulnerability reporting if available on this repository. If it is unavailable, open an issue requesting a private contact method without including exploit details or secrets.

For ordinary bugs, include software versions and a redacted error. The bridge listens on loopback and requires a random local key; do not expose its port to other machines. If you think your Inception key was exposed, revoke it in the Inception dashboard.
