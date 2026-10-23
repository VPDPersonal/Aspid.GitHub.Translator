# @aspid-lingo/core

Aspid Lingo code that runs anywhere: no DOM, no browser extension APIs, no Node.js APIs.
Browser extensions bundle it, and a VS Code extension can too. Products on other runtimes,
such as a JetBrains plugin in Kotlin, port it and keep the tests in `test/` passing on their side.

| Module | Role |
|---|---|
| `placeholders` | Placeholder tags (`<xN/>`, `<gN>…</gN>`) that carry markup through a translation engine; protection of code names and conventional commit prefixes; splitting of plain-text messages such as commit bodies. |
| `languages` | Target languages, matching of browser and OS language tags to them, language names. |
| `provider` | The `Provider` contract that every translation engine implements. |

Import a module by its name: `import { protectNames } from '@aspid-lingo/core/placeholders'`.
A translation engine that needs nothing but `fetch` belongs here too, so every product can offer it.

Run the tests with `npm test -w packages/core`.
