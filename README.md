# Jarvis

**Your WhatsApp group's AI build agent.** Tag `@jarvis` in any chat, attach a screenshot,
and a real Claude Code (or Codex) session ships code in your repo — streaming progress
back to the chat like a teammate who never sleeps.

```
WhatsApp group ──> jarvis (local Node.js) ──> Claude Code SDK / Codex CLI ──> your repo
      ^                        |                               |
      └── 🤖 progress + results ┴── session memory (resume) ────┘
```

## Quickstart

```bash
npx jarvis-relay
```

or from a clone:

```bash
git clone https://github.com/YOU/jarvis && cd jarvis
npm install
npm run setup
```

The setup wizard:

1. Verifies Node 20+ and your coding-agent CLIs
2. Detects whether **Claude Code** / **Codex** are installed and logged in, and walks
   you through either (subscription or API key — Jarvis just rides the CLI's auth)
3. Records your agent preferences: backend, repo, approval level, persona, turn budget
4. Links WhatsApp by QR (scan once — the session persists)
5. Starts the bot

## Usage

| Message | Effect |
|---|---|
| `@jarvis fix the login bug` | Sends work to the chat's agent |
| `@jarvis <request>` + screenshot | Image lands in `inbox/`, agent sees it |
| `!jarvis <request>` | Prefix trigger (same as mention) |
| `@jarvis status` | Active agent, backend, current session |
| `@jarvis id` | This chat's id — paste into `groups` in config |
| `@jarvis new` | Fresh session (wipes conversation memory) |
| `@jarvis use <profile>` | Bind this chat to another agent profile |
| `@jarvis use <session-id>` | Attach to a specific past session |
| `@jarvis sessions` | List recent sessions for the project |

### Sessions

The first request creates a new agent session; every later message **resumes the same
session**, so the agent remembers the whole conversation. Session ids live in
`jarvis.state.json`. To continue a session you ran manually in your terminal, grab the
UUID (`~/.claude/projects/<slugified-repo>/` for Claude, `~/.codex/sessions/` for Codex)
and `@jarvis use <uuid>`.

## CLI

```
jarvis              start the bot (auto-runs setup if unconfigured)
jarvis setup        interactive onboarding wizard
jarvis doctor       preflight: node, backends, auth, whatsapp session
jarvis agent list   show agent profiles
jarvis agent add    add an agent profile
jarvis agent remove remove an agent profile
```

## Configuration

`jarvis.config.json` (created by the wizard, see
[`jarvis.config.example.json`](jarvis.config.example.json)):

| Key (per agent) | Values | Notes |
|---|---|---|
| `backend` | `claude-code` \| `codex` | Which engine does the work |
| `projectDir` | absolute path | Repo the agent works in |
| `approval` | `read-only` \| `approve-edits` \| `full-auto` | Translated per engine below |
| `groups` | array of chat ids | Chats this agent answers in |
| `allowedUsers` | array of ids or `["*"]` | Who may trigger it. Default: everyone |
| `sessionId` | uuid or null | Session to attach at startup |
| `systemPrompt` | string | The agent's persona |
| `allowedTools` | array | Claude Code tool allowlist (omit for all) |
| `maxTurns` | number | Agent turn budget per request (default 40) |

Approval mapping:

| `approval` | Claude Code | Codex |
|---|---|---|
| `read-only` | plan mode | `--sandbox read-only` |
| `approve-edits` | acceptEdits | `--full-auto` |
| `full-auto` | bypassPermissions ⚠️ | bypass approvals+sandbox ⚠️ |

Top-level: `openGroups` (answer in any group it's added to), `selfTrigger`
(`Jarvis, …` from the bot account itself), `inboxDir`.

## Running 24/7

```bash
npm i -g pm2
pm2 start src/index.js --name jarvis && pm2 save
pm2 startup   # follow the printed sudo instruction — auto-start on boot
```

The bot is a plain Node + WebSocket client (no browser), so it also runs happily on a
$5 VPS — copy the folder, `npm i && npm run setup`, scan once.

## Security

- Triggering Jarvis means running an agent with shell access on your machine. Keep
  `allowedUsers` strict in groups you don't fully trust.
- `full-auto` approval hands the agent unrestricted shell. Prefer `approve-edits`.
- Group members must be registered: unknown chats are answered with their chat id and
  ignored until you add it to `groups`.
- Baileys is an unofficial WhatsApp client: fine for personal use, but automated
  activity on a personal number carries a small (rare) ban risk. A dedicated number
  removes the concern entirely.

## How it works

```
src/
├── index.js            runBot() entry point
├── whatsapp.js         Baileys adapter (QR link, message normalization, media)
├── router.js           triggers, whitelist, media inbox, job queue, replies
├── commands.js         @jarvis status/new/use/sessions
├── auth.js             whitelist + trigger parsing (LID-aware)
├── config.js           config loader + validation
├── state.js            per-chat agent/session state
├── queue.js            serializes agent jobs
├── cli/                setup wizard, doctor, agent manager, UI primitives
└── backends/
    ├── index.js        dispatcher (backend field → adapter)
    ├── claude.js       @anthropic-ai/claude-agent-sdk (session resume)
    ├── codex.js        codex exec CLI
    └── shared.js       prompt building + message splitting
```

Adding another engine = one file exporting
`run(agent, prompt, images, onProgress) → { summary, sessionId }` plus a line in
`backends/index.js`. PRs welcome.

## Troubleshooting

- **No reply at all** → `jarvis doctor`; check the chat id is registered (`@jarvis id`)
- **"Not logged in"** → run `claude` / `codex login` in a terminal, then re-test
- **WhatsApp disconnected** → the bot auto-reconnects; if logged out, delete
  `session-baileys/` and re-scan
- **Bot sends but never reacts** → ensure the phone came online in the last 14 days
  (WhatsApp logs out linked devices after two weeks of silence)

## Contributing

PRs welcome — new backends, better group permission flows, media types, tests. Keep
PRs focused; open an issue first for bigger changes.

## License

[MIT](LICENSE)
