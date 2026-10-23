<div align="center">

<img src="packages/brand/icon.svg" alt="" width="96" height="96">

# Aspid Lingo

**Translation for developers, right where they read.**

Pull requests, code review, commits and docs in your own language, on the sites and in the tools
where you already work. Code stays code, and the original is one click away.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

## Products

| Product | Where it works | Status |
|---|---|---|
| [Aspid Lingo for GitHub](apps/github) | Chrome extension for github.com: pull requests, code review, commits, READMEs | In development |
| Aspid Lingo for GitHub in other browsers | Edge, Firefox | Planned |
| Aspid Lingo for other sites | Reddit and other sites | Planned |
| Aspid Lingo for Rider | JetBrains IDEs | Planned |

## Repository layout

This is an npm workspaces monorepo. Shared code lives in `packages/`, products live in `apps/`.

| Path | Role |
|---|---|
| [`apps/github`](apps/github) | Aspid Lingo for GitHub, the browser extension. |
| [`packages/brand`](packages/brand) | The snake icons and the settings page fonts. |

## Development

Requires Node.js 22 or newer.

```bash
npm install          # all workspaces
npm test             # tests of every workspace
npm run build        # builds every product
npm run build -w apps/github
```

## License

[MIT](LICENSE) © Vladislav Panin
