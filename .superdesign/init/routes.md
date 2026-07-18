# Routes

Not a web app. Content script matches:

| URL | Adapter |
|-----|---------|
| `https://chatgpt.com/*` | ChatGPT |
| `https://claude.ai/*` | Claude |

UI surfaces (not routes):

- Send modal (hard gate)
- Protection-degraded banner
- L1 composer hints (advisory, never blocks)
