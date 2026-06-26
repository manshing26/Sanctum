# Security Policy

Sanctum is a local-first encrypted vault built and maintained by a single
developer. There is no dedicated security team and no bug bounty program —
but vulnerability reports are taken seriously and you will get a response.

## Supported Versions

Sanctum is in active alpha development. Only the **latest released version**
is supported with security fixes. There is no long-term support branch at
this stage — older releases should be considered unsupported and users
should update to the latest release.

| Version        | Supported          |
| -------------- | ------------------- |
| Latest release | ✅                   |
| Anything older | ❌                   |

## Reporting a Vulnerability

Please report security vulnerabilities using **GitHub's private vulnerability
reporting** feature, not a public issue:

1. Go to the [Security tab](https://github.com/manshing26/Sanctum/security)
2. Click **"Report a vulnerability"**
3. Describe the issue, including steps to reproduce and potential impact

This creates a private advisory visible only to the maintainer and you,
keeping any unpatched issue out of public view until a fix is available.

**Please do not open a public issue for security vulnerabilities.**

### What to expect

- Acknowledgement: within a few days
- This is a solo-maintained project worked on outside of full-time
  employment, so fix timelines vary with severity and maintainer
  availability — there's no SLA, but reports won't be ignored
- Credit in the release notes if you'd like it, or kept anonymous if you'd
  rather not be named

## Scope

In scope for reports:

- Vulnerabilities in the encryption, key derivation, or authentication flow
  (AES-256-GCM implementation, Argon2id usage, master key handling)
- Ways to access, recover, or infer vault contents without the correct
  vault password
- Sandbox/isolation escapes in the built-in browser or webview
- Code execution vulnerabilities (e.g. via crafted files, imports, or
  previewed documents)
- Backup/restore logic that could corrupt, leak, or expose vault data
- Logic that bypasses lockout, auto-lock, or the stated security model

### Known limitations — not vulnerabilities

The following are **documented design boundaries**, not bugs, and reports
limited to these will be closed as expected behavior. See the README
[Security Model](README.md#security-model) section for full detail:

- Sanctum does not protect decrypted content from other software running
  with full access to the unlocked user session or OS (e.g. malware,
  screen capture tools, or another logged-in process)
- The built-in browser has no VPN and does not hide network traffic from
  your ISP, network operator, or local network monitoring
- Opening a bookmark in an external browser (Chrome, Brave, Edge, Firefox)
  leaves Sanctum's isolation; privacy from that point depends on that
  browser's own private/incognito mode
- There is no password recovery by design — a lost vault password means
  permanently lost vault contents
- Sanctum is closed-source; the cryptographic design is documented
  publicly, but the implementation cannot be independently audited by
  reading this repository

If you're unsure whether something is in scope, report it anyway — it's
easier to triage a borderline report than to miss a real one.

## Disclosure

Please allow time for a fix to be released before any public disclosure.
Coordinated disclosure is appreciated given this is a single-maintainer
project.
