<div align="center">

# BAILEYS 

### **The intelligent interactive and productivity layer for WhatsApp protocols.**

<img src="https://readme-typing-svg.demolab.com?font=Space+Mono&size=22&pause=1200&color=00FFF0&center=true&vCenter=true&width=900&height=70&repeat=true&lines=BAILEYS+PROTOCOL.;NODE.JS+%2B+TYPESCRIPT.;RICH+MESSAGES+%2B+MEDIA.;BUILD+RELIABLE+INTEGRATIONS." alt="X4R1S3 TECHNOLOGY Baileys animated keywords" />

<img src="https://i.imgur.com/dBaSKWF.gif" height="16" width="88%" alt="animated coloured divider" />

<img src="https://raw.githubusercontent.com/X4R1S3/baileys/main/assets/rolling-circle.svg" width="90" alt="X4R1S3 TECHNOLOGY rolling circle" />

[![Version](https://img.shields.io/badge/version-1.0.0-00FFF0?style=for-the-badge&labelColor=07111F)](https://www.npmjs.com/package/@x4r1s3/baileys)
[![Developer X4R1S3](https://img.shields.io/badge/Developer-X4R1S3-B88CFF?style=for-the-badge&logo=telegram&labelColor=07111F)](https://t.me/X4R1S3)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-7CFFB2?style=for-the-badge&logo=node.js&logoColor=white&labelColor=07111F)](https://nodejs.org/)
[![Powered by X4R1S3/baileys](https://img.shields.io/badge/powered%20by-X4R1S3%2Fbaileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=07111F)](https://www.npmjs.com/package/@x4r1s3/baileys)
[![License](https://img.shields.io/badge/license-MIT-B88CFF?style=for-the-badge&labelColor=07111F)](#license-and-maintenance)

</div>

<div align="center">

[![Main WhatsApp Channel](https://img.shields.io/badge/WhatsApp%20Channel-Follow-25D366?style=for-the-badge&logo=whatsapp)](https://whatsapp.com/channel/0029Vb78BHmL2AU7fsANSH2y)
[![Backup WhatsApp Channel](https://img.shields.io/badge/Backup%20Channel-Follow-25D366?style=for-the-badge&logo=whatsapp)](https://whatsapp.com/channel/0029Vb6sMEy96H4VI2w3I50F)
[![Support Group](https://img.shields.io/badge/Support%20Group-Join-25D366?style=for-the-badge&logo=whatsapp)](https://chat.whatsapp.com/L5gckU4nNCq3bTH45tLB37?s=cl&p=a&iam=2)
[![Telegram Channel](https://img.shields.io/badge/Telegram%20Channel-Join-26A5E4?style=for-the-badge&logo=telegram)](https://t.me/X4R1S3_INNOVATION)
[![Telegram Group](https://img.shields.io/badge/Telegram%20Group-Join-26A5E4?style=for-the-badge&logo=telegram)](https://t.me/X4R1S3V3)
[![Website](https://img.shields.io/badge/Website-Visit-00FFF0?style=for-the-badge&logo=vercel&logoColor=black)](https://X4R1S3-ai.site)

</div>

> A readable, carefully maintained Baileys distribution for building reliable WhatsApp integrations. built by X4R1S3 populary known as X4R1S3 

`@x4r1s3/baileys` is a Node.js and TypeScript library for creating WhatsApp automations over the Baileys protocol. It provides a socket-oriented API for authentication, messaging, media, interactive content, rich responses, newsletters, groups, communities, business features, account utilities, and carefully documented extensions.

The package is maintained by **X4R1S3** under the **X4R1S3 TECHNOLOGY** organization. It is intended for developers who want a practical Baileys foundation with familiar interfaces, public TypeScript declarations, readable source code, explicit behavior, and room for carefully tested improvements.

## Table of contents

- [At a glance](#at-a-glance)
- [Installation](#installation)
- [Quick start](#quick-start)
- [CommonJS usage](#commonjs-usage)
- [Core capabilities](#core-capabilities)
- [Everyday message usage](#everyday-message-usage)
- [Rich menu example](#rich-menu-example)
- [Status, grids, tables, and flows](#status-grids-tables-and-flows)
- [Authentication and deployment guidance](#authentication-and-deployment-guidance)
- [Development workflow](#development-workflow)
- [Recent compatibility updates](#recent-compatibility-updates)
- [About X4R1S3](#about-X4R1S3)
- [Package layout](#package-layout)
- [Security and responsible use](#security-and-responsible-use)
- [Disclaimer](#disclaimer)
- [Privacy policy](#privacy-policy)
- [License and maintenance](#license-and-maintenance)
- [Compatibility additions](#compatibility-additions)
- [Comparison references](#comparison-references)
- [Additional functional compatibility helpers](#additional-functional-compatibility-helpers)
- [AI generation primitive](#ai-generation-primitive)
- [New AIRich metadata helpers](#new-airich-metadata-helpers)

## At a glance

| Property | Value |
| --- | --- |
| Package | `@x4r1s3/baileys` |
| Version | `1.0.0` |
| Runtime | Node.js 20 or newer |
| Module format | ESM, with CommonJS compatibility where supported |
| Type declarations | Included at `lib/index.d.ts` |
| License | MIT, as declared by the package metadata |
| Author | X4R1S3 |
| Maintainer | X4R1S3 |
| Entry point | `lib/index.js` |
| Repository | `https://github.com/X4R1S3/baileys` |

## Installation

| Method | Command | Notes |
| --- | --- | --- |
| From npm | `npm install @x4r1s3/baileys` | Standard install when published under your organization |
| From local archive | `npm install ./X4R1S3-baileys-1.0.0.tgz` | Place the `.tgz` beside your application |
| Source audit (no scripts) | `npm install --ignore-scripts` | Skips install hooks for local review |

Both npm and archive installs use the same import name:

```javascript
import { makeWASocket } from '@x4r1s3/baileys'
```

## Quick start

The following example creates a socket, stores multi-file authentication credentials, reconnects after an unexpected disconnect, and replies to incoming messages. Keep the session directory private and never commit it to a public repository.

```javascript
import {
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState
} from '@x4r1s3/baileys'
import P from 'pino'

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('Connected with @x4r1s3/baileys')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode !== DisconnectReason.loggedOut) {
        start().catch(console.error)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue

      await sock.sendMessage(message.key.remoteJid, {
        text: 'Hello from @x4r1s3/baileys'
      })
    }
  })
}

start().catch(console.error)
```


## Usage setup for the examples

The feature examples below must run after the socket has connected. They assume they are inside the `messages.upsert` handler shown above. Define the target JID before calling any helper. A JID is the WhatsApp address of the chat receiving the message.

```javascript
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const message of messages) {
    if (!message.message || message.key.fromMe) continue

    // The chat that sent the incoming message.
    const jid = message.key.remoteJid
    if (!jid) continue

    // Use real authorized JIDs for your own test account.
    const userJid = '15551234567@s.whatsapp.net'
    const groupJid = '120363000000000000@g.us'
    const voterJid = userJid
    const commandName = 'menu'
    const commandOutput = 'X4R1S3 command completed'
    const messageId = message.key.id

    // Sticker annotation expects a sticker media payload, not an undefined variable.
    const stickerMessage = {
      url: './sticker.webp',
      isAnimated: false
    }

    // Examples below can now use jid, userJid, groupJid, message, messageId,
    // stickerMessage, voterJid, commandName, and commandOutput.
  }
})
```

For a standalone command that is not handling an incoming message, define `jid` explicitly instead:

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendMessage(jid, { text: 'Hello from X4R1S3' })
```

Do not call a helper with an undeclared variable such as `sock.sendMessage(jid, ...)` before defining `jid`. Replace the example JIDs with real authorized user or group JIDs.

## CommonJS usage

```javascript
const {
  makeWASocket,
  useMultiFileAuthState
} = require('@x4r1s3/baileys')
```

If your runtime or bundler does not support this interop path, use the ESM import form instead.

## Core capabilities

| Area | What it covers |
| --- | --- |
| Connections & authentication | WebSocket connection events, reconnect handling, browser identity configuration, pairing-code flows, connection state transitions |
| Auth persistence | Multi-file credentials, single-file state, SQLite-backed persistence (optional driver), cache-manager integrations |
| Messages & conversations | Text, mentions, replies, reactions, edits, deletions, forwards, polls, contacts, locations, events, group invitations, quoted messages, disappearing messages, view-once envelopes |
| Media & albums | Images, video, audio, documents, stickers, thumbnails, albums; sourced from URLs, local files, or buffers; optional `sharp` / `@napi-rs/image` / `jimp` image processing; GIF-style video playback |
| Interactive content | Buttons, lists, native flows, hydrated templates, carousel layouts, button grids |
| Rich content & previews | Code blocks, tables, inline entities, LaTeX-oriented content, link previews, structured response arrays |
| Rich menus (experimental) | Header image, row/carousel cards, stable button IDs, toast metadata, disclaimers, footer action |
| Groups & communities | Group creation, participant management, settings, metadata, invites, labels, community/subgroup relationships |
| Newsletters & channels | Channel metadata, follow/unfollow, posts, reactions, media, polls |
| Account, business & privacy | Profile/business helpers, product & catalog operations, privacy controls, username utilities, status publishing, favorites management |
| Storage & protocol utilities | In-memory and ordered-dictionary stores, cache-manager support, LID/phone-number resolution, event utilities, message normalization, media retry handling, TypeScript declarations |

## Everyday message usage

| Message type | Key options | Example |
| --- | --- | --- |
| Text | `text` | `sock.sendMessage(jid, { text: '...' })` |
| Media with caption | `image` / `video` / `audio` / `document`, `caption` | `sock.sendMessage(jid, { image: { url } , caption: '...' })` |
| GIF-style video | `video`, `gifPlayback: true` | `sock.sendMessage(jid, { video: { url }, gifPlayback: true })` |
| View-once media | `viewOnce: true` (also `viewOnceV2`, `viewOnceV2Extension`, `spoiler`) | `sock.sendMessage(jid, { image: { url }, viewOnce: true })` |
| Spoiler / view-once (new) | `mediaSpoilerMode: 'viewOnce' \| 'native'` | see below |

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendMessage(jid, {
  text: 'A message from X4R1S3'
})

await sock.sendMessage(jid, {
  image: { url: './media/photo.jpg' },
  caption: 'A photo message'
})

await sock.sendMessage(jid, {
  video: { url: './media/animation.mp4' },
  gifPlayback: true,
  caption: 'Animated media'
})

await sock.sendMessage(jid, {
  image: { url: './media/private-image.jpg' },
  caption: 'Open once',
  viewOnce: true
})

await sock.sendMessage(jid, {
  video: { url: './media/clip.mp4' },
  caption: 'View-once video',
  mediaSpoilerMode: 'viewOnce'
})

await sock.sendMessage(jid, {
  image: { url: './media/hidden-preview.jpg' },
  mediaSpoilerMode: 'native'
})
```

`mediaSpoilerMode` is an additional, opt-in path for supported image, video, document, or sticker media:

| Value | Effect |
| --- | --- |
| `viewOnce` | Wraps supported media in a view-once envelope |
| `native` | Applies the native spoiler context flag |

The existing `viewOnce`, `viewOnceV2`, `viewOnceV2Extension`, and `spoiler` options remain supported and take precedence over `mediaSpoilerMode` when explicitly set.

## Rich menu example

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.richMenu(jid, {
  header: {
    title: 'X4R1S3 Menu',
    image: {
      url: 'https://example.com/menu.jpg',
      mime_type: 'image/jpeg'
    }
  },
  body: {
    row: true,
    carousel: false,
    cards: [
      {
        title: 'Account',
        buttons: [
          { id: 'profile', text: 'Profile' },
          { id: 'settings', text: 'Settings' }
        ]
      },
      {
        title: 'Support',
        buttons: ['help', 'contact']
      }
    ]
  },
  footer: {
    text: 'X4R1S3 TECHNOLOGY',
    url: 'https://example.com'
  }
})
```

| Rich menu field | Purpose |
| --- | --- |
| `header` | Optional title and image shown above the menu |
| `body.row` / `body.carousel` | Layout mode for the cards |
| `body.cards` | Rows of stable button IDs and labels |
| `footer` | Text plus an optional action URL |

## Status, grids, tables, and flows

| Helper | Purpose |
| --- | --- |
| `sendStatus` | Post a status update, optionally with mentions via `statusJidList` |
| `sendRichButtonGrid` | Send a card grid of stable-ID buttons |
| `sendInteractiveTable` | Send tabular content with headers, rows, and action buttons |
| `sendWhatsAppFlow` | Launch a published WhatsApp Flow |

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendStatus({ text: 'New X4R1S3 status' }, {
  statusJidList: ['1234567890@s.whatsapp.net']
})

await sock.sendRichButtonGrid(jid, {
  text: 'Choose an option',
  cards: [{
    title: 'Actions',
    buttons: [
      { id: 'first_action', text: 'First action' },
      { id: 'second_action', text: 'Second action' }
    ]
  }]
})

await sock.sendInteractiveTable(jid, {
  title: 'Plans',
  headers: ['Name', 'Price'],
  rows: [['Basic', '$5'], ['Pro', '$10']],
  buttons: [{ id: 'choose_pro', text: 'Choose Pro' }],
  footer: 'Select a plan'
})

await sock.sendWhatsAppFlow(jid, {
  text: 'Open the form',
  flowId: 'your-flow-id',
  flowToken: 'your-flow-token',
  flowName: 'your-flow-name',
  flowAction: 'navigate',
  flowActionPayload: { screen: 'WELCOME' }
})
```

These helpers are protocol- and client-dependent. Use graceful fallbacks when an application serves a wide range of WhatsApp client versions.

## Authentication and deployment guidance

| Practice | Detail |
| --- | --- |
| Session privacy | Keep the session directory private and excluded from version control |
| Access control | Use a dedicated service account or restricted filesystem permissions where possible |
| Secrets handling | Do not place access tokens, private keys, phone numbers, or personal account data in the README, package archive, or a public repository |
| Dependency pinning | Pin dependencies with a lockfile for production deployments |
| Runtime | Use a supported Node.js runtime |
| Connection handling | Monitor connection events; handle logout separately from recoverable disconnects; avoid uncontrolled parallel sockets on reconnect |

## Development workflow

```bash
npm test
```

Before submitting changes, validate ESM syntax, CommonJS compatibility where applicable, generated protocol files, and the declarations in `lib/index.d.ts`. Keep package metadata, exports, runtime requirements, and documentation synchronized. When a protocol behavior is experimental, document the fallback behavior and the client versions used during testing.

## Recent compatibility updates

| Update | Detail |
| --- | --- |
| Album association fix | Album child messages use association type `1`, the compatible child-association wire value, rather than treating the `MEDIA_ALBUM` message category as the association value |
| View-once preserved | Explicit view-once implementations remain unchanged |
| `mediaSpoilerMode` | New opt-in path for a view-once envelope or native spoiler flag, without altering existing defaults |

## About X4R1S3

This package is built and maintained by **X4R1S3**. X4R1S3 is a developer populary known as X4R1S3 that is focused on practical, accessible, and reliable software projects across the JavaScript and TypeScript ecosystem, with a focus on cyber security and responsible full stack and software engineering.

| | |
| --- | --- |
| Tech stack | JavaScript, HTML, TypeScript, Node.js, GitHub, Baileys, APIs, key-value stores |
| Project types | Application development, websites, WhatsApp bots, Telegram bots, API endpoints, games |
| Telegram | [@X4R1S3](https://t.me/X4R1S3) |
| Email | X4R1S3authorized@gmail.com |

The developer's work is driven by a commitment to learning, experimentation, clear documentation, and useful software that developers can understand and extend. This package reflects that commitment through its readable source, public declarations, practical examples, and emphasis on responsible automation.

## Package layout

| Path | Contents |
| --- | --- |
| `lib/` | JavaScript implementation, supporting utilities, public TypeScript declarations |
| `WAProto/` | Generated WhatsApp protocol definitions |
| `engine-requirements.js` | Installation-time runtime checks |
| `package.json` | Package metadata, scripts, dependencies, exports |
| `README.md` | User-facing installation and usage guide |

## Security and responsible use

This library interacts with WhatsApp accounts and user communications.

| Guideline | Detail |
| --- | --- |
| Authorization | Use only with accounts and data you are authorized to control |
| Compliance | Respect WhatsApp's terms, applicable law, and message participants' privacy expectations |
| Messaging conduct | Avoid unsolicited messaging |
| Credential safety | Protect authentication state and never commit session files, tokens, private keys, or personal data to a public repository |
| Media access | Limit access to stored media |
| Transparency | Provide clear notice when an application performs automated actions |
| Dependency review | Review installation scripts and optional dependencies before deploying to production; use pinned versions for repeatable builds |

## Disclaimer

`@x4r1s3/baileys` is an independent, source-available Node.js library that communicates with WhatsApp using the Baileys protocol. It is not affiliated with, endorsed by, or officially connected to WhatsApp LLC or Meta Platforms, Inc. "WhatsApp" is a trademark of its respective owner, referenced here only for interoperability description.

**No malware, no phishing, no hidden network calls.** As a matter of project policy and design:

| Statement | Detail |
| --- | --- |
| No malicious payloads | The package does not contain, download, execute, or otherwise support malware, spyware, ransomware, keyloggers, or similar malicious code. |
| No phishing or credential harvesting | The library does not construct, send, or facilitate phishing messages, fake login prompts, or credential-harvesting flows. It provides generic messaging primitives; how an application built on top of them is used is the responsibility of that application's developer. |
| No covert data exfiltration | The package does not silently transmit your messages, contacts, media, or authentication state to X4R1S3, X4R1S3 TECHNOLOGY, or any third party. The only network calls it makes are the ones necessary to connect to WhatsApp's own servers, plus explicitly caller-invoked helpers (such as `checkStatusWA`) that are never triggered automatically. |
| No obfuscated code | The source is distributed as readable JavaScript/TypeScript with public type declarations, so it can be inspected line by line. Installs can be run with `--ignore-scripts` for an audit-first review, as noted in the [Installation](#installation) table. |
| Not a guarantee, an invitation to verify | This statement describes the project's design intent and current source code. It is not a substitute for your own review, a third-party security audit, or a legal warranty. You are encouraged to read the source, pin dependency versions, and review any application built on top of this package before deploying it. |

### Developer responsibility and acceptable use

This package gives developers general-purpose building blocks for WhatsApp automation (messaging, groups, newsletters/channels, rich responses, and similar features). Like any general-purpose toolkit, those same building blocks can be pointed at abusive uses by a developer who chooses to. The table below names the patterns this project explicitly does **not** endorse, alongside why they're harmful:

| Prohibited / discouraged use | Why it's a problem |
| --- | --- |
| Auto-following WhatsApp channels/newsletters on behalf of users without their explicit, informed consent | Misrepresents the user's intent, inflates follower counts artificially, and can violate WhatsApp's platform policies |
| Sending unsolicited "channel pill" style promotional messages, forwarded rich-response spam, or bulk broadcast content to people who did not opt in | Standard spam/harassment; damages recipients' experience and violates most anti-spam and consumer-protection laws |
| Using the bundled diagnostic helpers (e.g. `checkStatusWA`) for bulk number enumeration or unsolicited scanning of phone numbers | Enables targeting and abuse of people who never opted into any check; the helper's own documentation already flags this |
| Impersonating WhatsApp, Meta, or another party; phishing; credential harvesting | Deceives end users and is illegal in most jurisdictions |
| Evading WhatsApp's account-integrity enforcement, terms of service, or rate limits | Undermines platform trust and the safety of the messaging ecosystem for everyone |

**Where responsibility sits.** X4R1S3 TECHNOLOGY builds and documents the library itself, not the applications developers build with it. If a developer chooses to use this package to do any of the above, **that developer — not X4R1S3 TECHNOLOGY or the `@x4r1s3/baileys` project — is solely responsible for that conduct**, including any legal, financial, or platform consequences that follow from it. The maintainers do not operate, monitor, or have visibility into third-party deployments of this code, and inclusion of a feature in this library is not an endorsement of every way it could be used.

This project's own position is the opposite of the misuse above: X4R1S3 TECHNOLOGY is built around respecting user privacy and giving developers transparent, inspectable tools — not around helping anyone spam, deceive, or manipulate WhatsApp users. Developers who build on this package are expected to hold themselves to that same standard.

**No warranty.** This software is provided "as is," without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent permitted by the license declared in `package.json`. Use of this package to interact with WhatsApp may be subject to WhatsApp's own terms of service, which are outside the maintainers' control.

## Privacy policy

This section describes what the package itself does and does not do with data. It does not describe how any particular application built on top of this package handles data — that is determined by the developer of that application.

**Data the package handles locally, on your own infrastructure:**

| Data type | How it's handled |
| --- | --- |
| Authentication/session state | Generated and stored wherever your application configures it (e.g. `useMultiFileAuthState('./session')`). The package does not upload this elsewhere. Keep it private, as noted in [Security and responsible use](#security-and-responsible-use). |
| Messages and media | Sent to and received from WhatsApp's own servers as part of normal protocol operation. The package does not copy, log, or relay this content to X4R1S3, X4R1S3 TECHNOLOGY, or any other third party. |
| Phone numbers passed to optional helpers | `checkStatusWA` sends a phone number to whatever endpoint you configure for that call. This only happens if your code explicitly calls it; the destination and its own privacy practices are your responsibility to review before use. |

**What the package does not do:**
- It does not phone home, run analytics/telemetry, or transmit usage data to X4R1S3, X4R1S3 TECHNOLOGY, or any other party.
- It does not embed hidden credentials, tracking identifiers, or remote "kill switches."
- It does not access data outside of what your application explicitly wires it up to.

**Your responsibilities as a developer.** If you build an application on top of this package that collects personal data (e.g. contacts, message content, phone numbers), you are the data controller for that application and are responsible for complying with applicable privacy laws (such as GDPR, CCPA, or Nigeria's NDPA) and with WhatsApp's own terms and business policies. This package is a communication toolkit, not a compliance framework.

**Contact.** Questions about this policy or the project can be sent to X4R1S3authorized@gmail.com or via [@X4R1S3](https://t.me/X4R1S3) on Telegram.

## License and maintenance

This distribution is provided under the license declared in `package.json` and the accompanying license file. Review those terms before redistributing or combining this package with third-party code.

**@x4r1s3/baileys is built and maintained by X4R1S3 under the X4R1S3 TECHNOLOGY organization.** Contributions, bug reports, and carefully documented improvements are welcome through the project repository.

## Compatibility additions

The current source includes several independently implemented compatibility helpers identified during comparison with the published upstream package. These additions preserve the X4R1S3 package identity and do not copy package-specific attribution enforcement or remote licensing checks.

### Copy-to-clipboard rich response

`sendCopyButton` creates a forwarded GenAI-style rich response with a copy-to-clipboard addon action.

| Option | Purpose |
| --- | --- |
| `text` | The content that gets copied |
| `label` | Optional visible button text |
| `alignment` | `END`, `START`, or `CENTER` |

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendCopyButton(jid, {
  text: 'npm install @x4r1s3/baileys',
  label: 'Copy install command',
  alignment: 'END'
})
```

As with other private or experimental WhatsApp rich-response layouts, clients may fall back to plain rendering or ignore the addon action.

### Slot-machine HTML generator

`generateSlotMachineHtml` produces a self-contained five-reel Fruit Bonanza game with adjustable starting credits. It is a standalone HTML payload and performs no network requests.

| Option | Purpose |
| --- | --- |
| `title` | Display title for the generated page |
| `startingCredits` | Initial credit balance |

```javascript
import { generateSlotMachineHtml } from '@x4r1s3/baileys'

const html = generateSlotMachineHtml({
  title: 'X4R1S3 Fruit Bonanza',
  startingCredits: 500
})
```

The generator does not by itself send HTML through WhatsApp. Applications should only use an HTML-capable message primitive when that primitive is available and authorized for their deployment.

### Optional ban-status checker

`checkStatusWA` is an explicit, caller-invoked diagnostic helper. It is never called during installation, socket creation, reconnection, or message sending. The endpoint is configurable, credentials are not embedded, and callers should review the endpoint's terms and privacy implications before sending a phone number.

```javascript
import { checkStatusWA } from '@x4r1s3/baileys'

const result = await checkStatusWA('+447700900123', {
  diagnostic: true
})
console.log(result.status) // active, banned, blocked, not_registered, rate_limited, or unknown
```

| Status value | Meaning |
| --- | --- |
| `active` | Number appears active on WhatsApp |
| `banned` | Number appears banned |
| `blocked` | Number appears blocked |
| `not_registered` | Number is not registered on WhatsApp |
| `rate_limited` | Check was rate limited |
| `unknown` | Status could not be determined |

This helper is not an anti-ban guarantee, does not bypass enforcement, and should not be used for bulk enumeration or unsolicited checking.

## Comparison references

The feature comparison was based on the published package metadata and documentation available from [npm][1] and the independent package analysis page at [Socket][2]. The X4R1S3 implementation adds compatible behavior through readable, package-owned code rather than copying upstream-specific integrity, attribution, or remote-verification mechanisms.

[1]: https://www.npmjs.com/
[2]: https://socket.dev/

## Additional functional compatibility helpers

The source also exposes portable helpers for native-flow responses, view-once inspection, rich content preparation, HTML payload construction, and website previews. These are functional compatibility APIs only; package-specific identity checks, attribution enforcement, remote license gates, trusted-channel auto-follow behavior, and other ownership structures are not included.

| Helper | Purpose |
| --- | --- |
| `parseNativeFlowResponse` | Normalize quick-reply, single-select, and Flow response envelopes |
| `parseWhatsAppFlowResponse` | Return only responses identified as WhatsApp Flow responses |
| `buildWhatsAppFlowButton` / `makeWhatsAppFlowButton` | Build published Flow button parameters for a caller-owned Flow ID and token |
| `prepareRichTextMessage` | Build a forwarded rich text response |
| `prepareRichImageMessage` | Build a forwarded rich image response |
| `prepareRichLinkMessage` | Build a forwarded response with inline link entities |
| `prepareRichGenerationMessage` | Build a rich response from caller-provided rich content |
| `prepareHtmlMessage` | Build an HTML primitive payload for clients that support the experimental structure |
| `prepareSlotMachineMessage` | Wrap the local slot-machine generator as an HTML message payload |
| `generateLinkPreviewHtml` / `generateWebsitePreviewHtml` | Create escaped link cards or an explicitly requested metadata preview |
| `parseViewOnceInfo` and related helpers | Inspect, download, reconstruct, and apply explicit view-once policies |

All networked helpers are opt-in. Website previews fetch only when explicitly called, and Flow helpers require credentials and identifiers owned by the application. Experimental WhatsApp layouts remain client-dependent and should always have a plain-text fallback.

## AI generation primitive

`buildImaginePrimitive` creates the Meta-style AI image or animation generation-state payload used by rich responses. It is a pure payload builder — it does not call a generation service itself, generate media, or send anything on its own; callers wire it up to whatever AI generation backend they use, then pass the resulting primitive into a rich-response message.

| Field | Purpose |
| --- | --- |
| `state` | Generation status: `GENERATING`, `COMPLETE`, or `ERROR` |
| `mediaUrl` | URL of the generated media


## X4R1S3-compatible rich messaging additions

The X4R1S3 socket now includes the compatible rich-message helpers documented by [`X4R1S3`](https://github.com/X4R1S3/baileys), while retaining X4R1S3-specific APIs and package identity. These helpers are opt-in convenience methods over the existing WhatsApp message relay layer.

| Helper | Purpose |
| --- | --- |
| `sendRichMedia` | Sends a complete GenAI-style rich response envelope. |
| `sendRichGeneration` | Sends an AI image/video generation card with a generation state. |
| `updateRichGeneration` | Replaces an existing generation card using the message-edit protocol. |
| `sendRichText` | Sends text inside a forwarded rich-response envelope. |
| `sendRichImage` | Sends an image inside a forwarded rich-response envelope. |
| `sendRichLink` | Sends inline links inside a forwarded rich-response envelope. |
| `sendReels` | Sends rich response content containing reel metadata. |
| `sendRichSources` | Sends rich response content with source metadata. |
| `sendLink` / `sendLinkV2` | Convenience aliases for rich inline-link responses. |
| `sendRichWebview` | Sends a native-flow URL CTA for a hosted WebView or Mini App. |

### Rich text, images, and links

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendRichText(jid, {
  text: 'A rich response from X4R1S3'
})

await sock.sendRichImage(jid, {
  url: 'https://example.com/image.png',
  mimeType: 'image/png'
})

await sock.sendRichLink(jid, {
  text: 'Read the documentation',
  links: [{ text: 'Documentation', url: 'https://example.com/docs' }]
})
```

### AI generation cards

```javascript
const jid = '15551234567@s.whatsapp.net'
const messageId = 'MESSAGE_ID_FROM_WHATSAPP'
const pending = await sock.sendRichGeneration(jid, {
  text: 'Generating an image…',
  mediaType: 'image',
  status: 'GENERATING',
  estimatedMs: 5000,
  itemId: 'image-001'
})

await sock.updateRichGeneration(jid, pending.messageId, {
  text: 'Generation complete',
  mediaType: 'image',
  status: 'READY',
  url: 'https://example.com/generated.png',
  itemId: 'image-001'
})
```

`updateRichGeneration` requires the original message identifier returned by `sendRichGeneration`. Generation and rich-response payloads are protocol-sensitive and should be tested against the WhatsApp clients your application supports.

### WebView or Mini App CTA

```javascript
const jid = '15551234567@s.whatsapp.net'
await sock.sendRichWebview(jid, {
  title: 'Open the dashboard',
  text: 'Tap below to continue',
  buttonText: 'Open dashboard',
  url: 'https://example.com/dashboard',
  useWebview: true,
  toast: 'Opening dashboard'
})
```

The URL is validated before serialization. Treat button replies and URL destinations as untrusted input, and perform authorization on the server rather than relying on a button identifier.

### Reels and source metadata

```javascript
const jid = '15551234567@s.whatsapp.net'
const quotedMessage = undefined
await sock.sendReels(jid, [{
  url: 'https://example.com/reel.mp4',
  title: 'Featured reel'
}], quotedMessage, { text: 'Featured today' })

await sock.sendRichSources(
  jid,
  'Useful references',
  [{ title: 'Project site', url: 'https://example.com' }],
  quotedMessage
)
```

These helpers preserve the existing `quoted` and send-option arguments where supported. The package does not enable background automation or contact discovery as a side effect of using them.

### References

[1]: https://github.com/X4R1S3/baileys "X4R1S3/baileys repository"


### Prepared-message relay targeting

`relayMessage` now accepts optional delivery-scoping controls compatible with X4R1S3’s relay API. These controls are intended for prepared messages and retry handling; use them only when the application understands the device-level delivery consequences.

```javascript
const jid = '15551234567@s.whatsapp.net'
const messageId = 'MESSAGE_ID_FROM_WHATSAPP'
const preparedMessage = { conversation: 'Prepared message' }
await sock.relayMessage(jid, preparedMessage, {
  messageId: 'message-id',
  participant: { jid: '15551234567@s.whatsapp.net' },
  protected: true
})

await sock.relayMessage(jid, preparedMessage, {
  messageId: 'message-id',
  retryParticipants: {
    jid: '15551234567:2@s.whatsapp.net',
    count: 1
  }
})
```

The `participant` option targets recipient-only delivery in a one-to-one chat. `retryParticipants` or `participants` identifies a device for retry resend, while `isSecret`, `protected`, and `me` restrict delivery to the corresponding device classes. These options do not bypass WhatsApp permissions or authorization checks.

| Added helper | Purpose |
| --- | --- |
| `sendAlbumMessage` | Sends two or more image/video items as an album. |
| `sendRichTextCopy`, `sendMarkdownQuote`, `sendQuoteCopy` | Rich Markdown responses with optional copy-to-clipboard actions. |
| `sendBotDiagnostics`, `sendBotCommand`, `sendBotToolResult` | Experimental bot metadata envelopes for diagnostics, commands, and resolved tool calls. |

### Usage

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendAlbumMessage(jid, [
  { type: 'image', data: { url: './one.jpg' } },
  { type: 'image', data: { url: './two.jpg' } }
], { caption: 'Album caption' })
```

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendRichTextCopy(jid, {
  text: '**Install command**\n\nnpm install @x4r1s3/baileys',
  copyText: 'npm install @x4r1s3/baileys',
  copyLabel: 'Copy command'
})

await sock.sendMarkdownQuote(jid, {
  text: 'Instruction:\n\n> Use this exact configuration.'
})
```

Bot metadata helpers are experimental and should not be used as authorization or security controls.

```ts
const jid = '15551234567@s.whatsapp.net'
const commandName = 'menu'
await sock.sendBotCommand(jid, {
  text: 'Run deployment',
  commandName: 'deploy',
  commandDescription: 'Deploy the current build',
  commandPrompt: 'Deploy the current build'
})
```




### Full-width stacked albums

`sendAlbumMessage` sends a rich vertical album rather than the legacy parent/child album collection. Each image or video is rendered as one large media item on its own row. Provide at least two publicly fetchable media URLs. Both `{ image: { url } }` and the typed `{ type: 'image', data: { url } }` forms are accepted.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendAlbumMessage(jid, [
  { image: { url: 'https://example.com/one.jpg' } },
  { image: { url: 'https://example.com/two.jpg' } },
  { image: { url: 'https://example.com/three.jpg' } }
], { caption: 'X4R1S3 album' })
```

The rich album path is URL-based and does not upload local buffers. Remove accidental whitespace from URLs before sending; the implementation trims URL values, but clean URLs are recommended.

### A2UI command menu

`sendA2UICommandMenu` sends the large command/function menu UI: an optional image header, title, command rows, URL buttons, and a native-flow fallback. The `rows` entries use `[command, description]` tuples, matching the menu layout shown in the WhatsApp client.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendA2UICommandMenu(jid, {
  image: { url: 'https://example.com/menu.jpg' },
  title: 'Speed menu',
  rows: [
    ['.menu', 'Main menu'],
    ['.ping', 'Speed check']
  ],
  buttons: [
    { text: 'Website', url: 'https://example.com' },
    { text: 'Support', url: 'https://example.com/support' }
  ]
})
```


### AIRich command menu and video grid

The compatibility update also exposes the two AIRich layouts that were not already present in X4R1S3. `sendAIRichCommandMenu` sends the manually serialized command card with an image, Markdown command table, optional widget CTAs, and footer URL actions. The image must be a publicly fetchable URL.

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendAIRichCommandMenu(jid, {
  image: 'https://example.com/menu.png',
  title: 'X4R1S3',
  subtitle: 'Choose a command',
  rows: [
    ['.menu', 'Show the main menu'],
    ['.ping', 'Check service latency']
  ],
  buttons: [
    { id: 'docs', text: 'Documentation', url: 'https://example.com/docs' }
  ],
  footer: 'Developed by - X4R1S3 TECHNOLOGY'
})
```

`sendVideoGridMessage` sends at least two video URL items as a `GenAIGridLayoutViewModel` containing `GenAIVideoPrimitive` entries. It is separate from `sendAlbumMessage`, which uses the vertical album layout.

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendVideoGridMessage(jid, [
  {
    url: 'https://cdn.example.com/first.mp4',
    title: 'First clip',
    thumbnailUrl: 'https://cdn.example.com/first.jpg',
    progressiveUrls: ['https://cdn.example.com/first-720p.mp4']
  },
  {
    url: 'https://cdn.example.com/second.mp4',
    title: 'Second clip',
    thumbnailUrl: 'https://cdn.example.com/second.jpg'
  }
])
```

Both layouts are experimental WhatsApp protocol structures. Client rendering can change, and callers should provide a plain-message fallback where reliability matters.


### Bot planning responses

`sendBotPlanning` sends a bot-planning rich response with a summary, ordered step text, and optional planning/query-plan capabilities.

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendBotPlanning(jid, {
  text: 'Preparing the deployment',
  steps: [
    { title: 'Build', body: 'Compile the application' },
    { title: 'Verify', body: 'Run the checks' },
    'Publish the release'
  ],
  queryPlan: true
})
```

### Newsletter invite metadata

`newsletterGetInviteInfo` accepts either a channel invite code or a WhatsApp channel invite URL and returns the resolved newsletter metadata, or `null` when WhatsApp does not return a matching record.

```ts
const info = await sock.newsletterGetInviteInfo('https://whatsapp.com/channel/INVITE_CODE')
console.log(info?.id, info?.name, info?.invite)
```

The lookup is an explicit network request and does not follow, join, or subscribe to the channel.


### Carousel, compatibility aliases, and source search

`sendCarousel` normalizes card media, captions, footers, and buttons before sending a carousel message.

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendCarousel(jid, [
  {
    title: 'Documentation',
    body: { text: 'Read the API guide' },
    media: { image: { url: 'https://example.com/docs.jpg' } },
    buttons: [{ text: 'Open', id: 'docs' }]
  }
])
```

`HoldOn` is retained as a compatibility alias for `sendRichButtonGrid`. New applications should prefer the descriptive X4R1S3-named method.

`grepCode(pattern, options)` searches installed package source files and returns matching file, line, column, and source-line information. It is an explicit diagnostic helper and performs no network access.

```ts
const matches = sock.grepCode('prepareVideoGridMessage', { includeReadme: true })
```

### Interactive rich HTML

The compatibility update also exposes `sendRichHtmlMessage`, which uses the interactive GenAI HTML primitive and supports embedded tabs. Only pass trusted, sanitized HTML; this is not a general-purpose HTML sanitizer.

```ts
const jid = '15551234567@s.whatsapp.net'
await sock.sendRichHtmlMessage(jid, {
  title: 'X4R1S3 TECHNOLOGY',
  html: '<h1>Hello</hi>',
  url: 'https://X4R1S3-ai.site',
  trustedSources: ['X4R1S3-ai.site']
})
```

Multiple tabs can be supplied with `tabs`; each tab may provide its own `html`, `url`, and `trustedSources`. The structure is experimental and depends on WhatsApp client support.


## X4R1S3 unified responses and the built-in mini-app

`sendX4R1S3Message` accepts one object containing any supported combination of text, links, media, products, reels, tables, code, LaTeX, or suggestions. Unsupported optional sections are ignored by the rich-response serializer, so callers can use one stable entry point for heterogeneous response data.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendX4R1S3Message(jid, {
  text: 'Here is your result',
  links: [{ text: 'Open the docs', url: 'https://example.com/docs' }],
  table: {
    title: 'Summary',
    headers: ['Name', 'Status'],
    rows: [['X4R1S3', 'Ready']]
  }
})
```

`sendMiniApp` sends the bundled interactive mini-app as a trusted rich HTML screen. The helper does not fetch or execute caller-provided remote code; pass only presentation options such as `title` and keep authentication or business actions on your own server.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendMiniApp(jid, {
  title: 'X4R1S3 mini-app'
}, {
  quoted: message
})
```

The package also exports `BotCapabilityType`, `normalizeBotCapabilities`, `buildBotCapabilityMetadata`, and `buildBotRichResponse` for applications that need to construct compatible bot metadata.

### Combined RichAI and AIRich responses

`sendX4R1S3Message` can combine ordered RichAI sections with the package's other unified-response fields. This keeps text, tables, media, maps, and structured AIRich content in one message while preserving the order of the RichAI sections.

```js
await sock.sendX4R1S3Message(jid, {
  sections: [
    { type: 'text', value: 'Mission summary' },
    { type: 'table', value: {
      title: 'Telemetry',
      headers: ['System', 'State'],
      rows: [['Navigation', 'Nominal']]
    } },
    { type: 'codeBlock', value: { language: 'js', code: 'return status' } }
  ],
  richLabel: { text: 'X4R1S3 STATUS', variant: 'POSITIVE' }
})
```

Embedded-screen tabs can also carry one or more native media items. Multiple media items are rendered as a horizontal strip inside the tab.

```js
await sock.sendX4R1S3Message(jid, {
  embeddedScreen: {
    title: 'Mission gallery',
    tabs: [{
      id: 'gallery',
      tab_header: 'Images',
      sections: [{
        __typename: 'GenAIUnifiedResponseSection',
        view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: {
          __typename: 'GenAITextPrimitive', text: 'Orbital systems'
        }}
      }],
      media: [
        { type: 'image', url: 'https://example.com/orbit-a.jpg' },
        { type: 'image', url: 'https://example.com/orbit-b.jpg' }
      ]
    }]
  }
})
```

Newsletter statuses support push-to-talk voice notes in addition to text, images, and video. The account must have Channel Status publishing capability.

```js
await sock.sendNewsletterStatus('123456789@newsletter', {
  audio: { url: './mission-update.ogg' },
  ptt: true,
  backgroundArgb: 0xff1e88e5
})
```


## New AIRich metadata helpers

The package includes experimental helpers for protocol-backed rich clients. Rendering depends on the recipient's WhatsApp client version; these helpers do not call Meta AI or any private backend.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendA2UIMessage(jid, {
  type: 'im_a2ui',
  data: {
    version: 'v0.9',
    createSurface: {
      surfaceId: 'custom-card',
      catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      components: [{ id: 'root', component: 'Column', children: ['title'] }]
    }
  }
})

await sock.sendRichMap(jid, {
  centerLatitude: 6.5244,
  centerLongitude: 3.3792,
  annotations: [{ latitude: 6.53, longitude: 3.38, title: 'Lagos', body: 'Nigeria' }],
  showInfoList: true
})

await sock.sendBotPromptSuggestions(jid, {
  text: 'Choose a follow-up',
  suggestions: ['Summarize this', 'Translate this', 'Explain further'],
  selectedPromptId: 'translate'
})

await sock.sendBotSources(jid, {
  text: 'Relevant sources:',
  sources: [{
    provider: 2,
    url: 'https://example.com/docs',
    query: 'baileys proto',
    title: 'Documentation',
    citationNumber: 1
  }]
})

await sock.sendRichDynamicMedia(jid, {
  type: 'IMAGE',
  url: 'https://example.com/image.jpg',
  version: 1
})

await sock.sendBotPttTranscript(jid, {
  text: 'Voice transcript',
  transcript: 'Hello, this text came from a voice message.'
})

await sock.sendSocialEntity(jid, {
  platform: 'YOUTUBE',
  username: 'example',
  title: 'Example creator',
  imageUrl: 'https://example.com/avatar.png',
  entityUrl: 'https://www.youtube.com/@example',
  isVerified: true,
  resultText: 'See results'
})

await sock.sendInstagramProfile(jid, {
  username: 'example',
  title: 'Example profile',
  imageUrl: 'https://example.com/avatar.png',
  entityUrl: 'https://www.instagram.com/example',
  isVerified: true,
  resultText: 'See results'
})
```

The map, prompt, source, dynamic-media, transcript, A2UI, and social/entity payloads are serialized from the generated `WAProto` structures. Validate URLs, button identifiers, and any user-supplied metadata in your own application before sending.

### Additional media, interaction, and scheduling helpers

The package also includes `replyButton`, `sendFile`, `sendPhotoLive`, `sendProgress`, `sendMessageModify`, `sendMessageModifyV2`, `sendNewRichMedia`, `sendUnifiedTable`, `scheduleMessage`, and `sendGroupStatus` compatibility helpers.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendProgress(jid, 'Uploading', { progress: 65 })
await sock.sendFile(jid, 'https://example.com/report.pdf', 'report.pdf', 'Latest report')
await sock.sendPhotoLive(jid, {
  video: { url: 'https://example.com/motion.mp4' },
  image: { url: 'https://example.com/still.jpg' },
  caption: 'Motion photo'
})
await sock.scheduleMessage(jid, { text: 'Reminder' }, new Date(Date.now() + 60_000))
```

### Polls with attached images

Image polls are a multi-message feature. Use `sendImagePoll` directly, or pass the same `poll` object to `sendMessage`. Each image option contains a `name` and an `image` source. The sender uploads each image, creates the poll option hashes, and relays the associated media-poll messages.

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendImagePoll(jid, {
  name: 'Choose a cover',
  selectableCount: 1,
  values: [
    { name: 'Blue', image: { url: 'https://example.com/blue.jpg' } },
    { name: 'Green', image: { url: 'https://example.com/green.jpg' } }
  ]
})
```

At least two options are required, and image polls require the configured Baileys media uploader. This is separate from ordinary text polls and does not add channel annotations or subscribe to any channel.

### Complete compatibility feature inventory

This build includes the complete published `X4R1S3` compatibility surface: authentication and pairing; text, mentions, reactions, edits, deletes, forwards, polls, events, view-once messages, stickers, sticker packs, sticker annotations, albums, live photos, video grids, GIF playback, buttons, reminder actions, lists, native flows, carousels, hydrated templates, interactive contacts, map/location cards, rich text, Markdown quotes, copy actions, rich images, link previews, unified responses, tables, code blocks, LaTeX, AIRich, A2UI, rich menus, reels, HTML screens, mini-apps, status updates, status actions, status mentions, custom status audiences, group status, newsletter/channel management, group and community management, labels, business and catalog helpers, favorites, privacy controls, usernames, password and passkey utilities, AI groups, Meta AI prompts, planning metadata, social/profile cards, bot diagnostics, media processing, app-state utilities, interop helpers, and the `X4R1S3` target-message helper.

Representative usage is documented below for sticker annotations, unified responses, A2UI command menus, image polls, live photos, social cards, reactions, stickers, scheduled messages, and profile-picture lookup.

## X4R1S3-compatible additions

The complete build also includes the compatible A2UI, AIRich, carousel, poll, live-photo, unified-response, newsletter-status, and sticker-annotation helpers. These are opt-in APIs over the existing socket and do not change ordinary `sendMessage()` behavior.

### Reminder buttons and metadata

The `Button` builder now supports native reminder actions. The display text and reminder ID are written into the native-flow payload, while additional provider-specific fields can be supplied through the options object.

```js
import { Button } from '@x4r1s3/baileys'

const jid = '15551234567@s.whatsapp.net'
const reminderCard = new Button(sock)
  .setTitle('Daily routine')
  .setBody('Would you like a reminder?')
  .addReminder('Set reminder', 'daily-routine', {
    frequency: 'DAILY'
  })
  .addCancelReminder('Cancel reminder', 'daily-routine')

await reminderCard.send(jid)
```

An AIRich response can also carry validated `BotReminderMetadata`:

```js
const jid = '15551234567@s.whatsapp.net'
const requestMessageKey = {
  remoteJid: jid,
  fromMe: false,
  id: 'REQUEST_MESSAGE_ID'
}

await sock.sendX4R1S3Message(jid, {
  contentText: 'Reminder created.',
  reminderMetadata: {
    requestMessageKey,
    action: 'CREATE',
    name: 'Water the plants',
    frequency: 'DAILY',
    nextTriggerTimestamp: String(Math.floor(Date.now() / 1000) + 86400)
  }
})
```

`action` accepts `NOTIFY`, `CREATE`, `DELETE`, or `UPDATE`. `frequency` accepts `ONCE`, `DAILY`, `WEEKLY`, `BIWEEKLY`, or `MONTHLY`. Reminder scheduling and rendering remain client-dependent.

### Status actions

Status actions are available through the existing `messages.upsert` stream. Reactions and protocol messages are excluded from status detection, so a status listener does not treat a status reaction as a new story.

```js
const stopStatusListener = sock.onStatusMessage(async ({ message, authorJid, kind }) => {
  if (kind === 'status') {
    await sock.viewStatus(message)
    await sock.likeStatus(message, '✅')
    // For media statuses only:
    // const media = await sock.downloadStatus(message, 'buffer')
    // await sock.commentStatus(message, 'Nice update!')
  } else {
    await sock.viewGroupStatus(message)
    await sock.likeGroupStatus(message, '🔥')
  }

  console.log('Status author:', authorJid)
}, {
  from: 'all',
  includeGroupStatus: true
})

// Later, detach it with: stopStatusListener()
```

### Sticker annotation

```js
const jid = '15551234567@s.whatsapp.net'
const messageKey = { remoteJid: jid, fromMe: false, id: messageId, participant: userJid }
const stickerMessage = { url: './sticker.webp', isAnimated: false }
await sock.sendStickerAnnotation(jid, {
  parentMessageKey: messageKey,
  stickerMessage: stickerMessage,
  count: 3,
  intervalMs: 1000
})
```

### Unified response and A2UI

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendUnifiedResponse(jid, {
  sections: [{
    view_model: {
      primitives: [{ __typename: 'GenAIQueryPlanPrimitive', title: 'Plan' }]
    }
  }]
})

await sock.sendA2UICommandMenu(jid, {
  title: 'Commands',
  commands: [{ id: 'help', label: 'Help' }]
})
```

### Polls, live photos, and social cards

```js
const jid = '15551234567@s.whatsapp.net'
await sock.sendImagePoll(jid, {
  name: 'Choose a cover',
  selectableCount: 1,
  values: [
    { name: 'Blue', image: { url: 'https://example.com/blue.jpg' } },
    { name: 'Green', image: { url: 'https://example.com/green.jpg' } }
  ]
})

await sock.sendPhotoLive(jid, {
  video: { url: './motion.mp4' },
  image: { url: './still.jpg' },
  caption: 'Motion photo'
})

await sock.sendSocialProfile(jid, {
  platform: 'linkedin',
  entityType: 'LINKEDIN_PROFILE',
  username: 'example',
  entityUrl: 'https://www.linkedin.com/in/example'
})
```

### Profile-picture behavior

The package supports authorized profile-picture lookup with `profilePictureUrl(jid, 'image')` and legitimate social/profile cards. It does **not** spoof a sender or force viewers to see another person's profile picture when a command runs. Any profile-picture sharing must be explicitly initiated by the application and must respect the target user's privacy and consent.


## Interactive contact card

```js
const jid = '15551234567@s.whatsapp.net'
const commandName = 'menu'
const commandOutput = 'X4R1S3 command completed'

await sock.sendInteractiveContactCard(jid, {
  title: 'X4R1S3',
  body: commandOutput,
  footer: 'X4R1S3 TECHNOLOGY',
  buttonParams: {
    command: commandName,
    status: 'completed'
  }
})
```

## X4R1S3 target-message protocol helper

`X4R1S3(jid, target)` runs the experimental target-message protocol sequence, then cleans up its temporary messages. The target may be a message ID string or an object containing `id` or `stanzaId`.

```js
const jid = '15551234567@s.whatsapp.net'
const messageId = 'MESSAGE_ID_FROM_WHATSAPP'
await sock.X4R1S3(jid, { id: messageId })
```

<div align="center">

<sub>Thanks for reading my README.</sub>

<img src="https://i.imgur.com/dBaSKWF.gif" height="16" width="88%" alt="animated coloured footer line" />

<br><br>

<img src="https://capsule-render.vercel.app/api?type=waving&color=00FFF0&height=100&section=footer" alt="@x4r1s3/baileys footer" />

</div>
