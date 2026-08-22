# Security

Credentials are kept locally under `~/.grok-auth` with restrictive permissions where supported. Normal output and JSON output redact secrets. Credential exports are sensitive and should be treated like live tokens. No telemetry or remote service is used.
