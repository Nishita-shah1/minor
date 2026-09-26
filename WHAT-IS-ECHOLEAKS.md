# What is EchoLeaks?

EchoLeaks is a **private, read-only file sharing** product. You encrypt documents in your browser, share them with specific people, and later investigate whether a leaked screenshot matches a copy that was shown to one of those recipients.

It is built for situations where a document must leave your control carefully — contracts, decks, research, internal notes — and you still want a trail if that content shows up elsewhere as a screenshot.

---

## In one sentence

**Share encrypted documents. View them only in a protected browser. If a screenshot appears, try to match it to a recipient’s copy — and watch viewing behavior for exposure risk.**

---

## What it does

### 1. Encrypt and share locally
- Files are encrypted in the **owner’s browser** before upload.
- The server stores **ciphertext** and encrypted key material, not readable document contents.
- Recipients are invited by verified email and open a personal secure link.

### 2. Protected viewing
- Recipients decrypt and view supported files (**PDF**, **PNG**, **JPEG**) in a covered, fullscreen-style viewer.
- Each authorized copy can carry an experimental **invisible fingerprint** (TrustMark) unique to that recipient’s copy of that file.
- Content is covered when the viewer leaves fullscreen, switches tabs, loses authorization, or marking fails.

### 3. Investigate a suspected leak (Scan)
- The owner uploads a screenshot locally.
- Decoding and matching happen in the **owner’s browser**.
- An exact fingerprint match can point to the **recipient name, email, and share** associated with that copy.
- A match means “this looks like the copy shown to that share” — not proof of who pressed the capture button or who leaked on purpose.

### 4. Exposure risk on the dashboard
- While recipients view, EchoLeaks can record **disclosed viewing behavior** (after they accept a notice): estimated visible time, fullscreen exits, tab hides, page changes, print attempts.
- The owner dashboard shows an **exposure risk %** per file and recipient.
- That score is a **heuristic estimate** for hand-copy / photo-of-screen style risk. It is **not** proof of a leak and is kept separate from Scan fingerprint matches.

---

## What it is not

EchoLeaks does **not**:

- Prevent screenshots, phone photos, or someone writing content by hand
- Prove who took a screenshot or intentionally disclosed content
- Discover leaked material automatically on the public web
- Decrypt your documents on the server for analysis
- Guarantee fingerprint recovery for every crop, resize, JPEG, or phone photo (the fingerprint path is **experimental**)

---

## Who it’s for

| Role | What they do |
| --- | --- |
| **Owner** | Upload, encrypt, share, revoke, scan evidence, watch exposure risk |
| **Recipient** | Sign in with the invited verified email, unlock their vault, view protected copies |

---

## Privacy model (short)

| Stays in the browser | Lives on the server |
| --- | --- |
| Document plaintext after decrypt | Authorization, share status, schedules |
| Screenshot pixels during Scan | Encrypted objects and key envelopes |
| Fingerprint secrets and decoded IDs during investigation | Disclosed viewing-session metadata |
| Owner’s private key (IndexedDB + passphrase backup) | Public key material and encrypted private-key backup |

---

## Product surfaces

| Place | Purpose |
| --- | --- |
| `/` | Public landing |
| `/dashboard` | Views, observed screenshot shortcuts, print attempts, and exposure risk |
| `/dashboard/upload` | Encrypt and upload |
| `/dashboard/history` | Manage groups and secure links |
| `/dashboard/scan` | Investigate a screenshot |
| `/dashboard/profile` | Account and key vault |
| `/share/[shareId]` | Recipient protected viewer |

---

## Honest status

EchoLeaks is an active prototype. Client-side encryption and sharing are the core path. Fingerprinting and exposure-risk signals are useful investigation aids with clear limits — especially against hand copies and unqualified phone photos.

For implementation detail, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For local setup, see [`README.md`](./README.md).
