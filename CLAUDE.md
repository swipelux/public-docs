# Swipelux public docs

This repository contains the Mintlify source for Swipelux public documentation. The published site includes Integration Docs, a generated API v3 reference, and the compliance and onboarding Knowledge Base.

## Source of truth

- The OpenAPI contract at `/Users/andry/Downloads/api-1 (23).json` is authoritative for technical behavior.
- The policy-content source is `/Users/andry/brain/swipelux/docs-new` at fetched `origin/main` commit `b4c9b5b7101ec03e01424259f58a5c8763ea489b`.
- Read policy content from that commit, not from uncommitted files in the source repository.

## Content boundaries

- Publish only API v3. v1 and v2 must not appear in published content.
- Do not invent legal, webhook-security, retry, permission, availability, or product-behavior claims.
- Keep Terms-of-Service pages out of the approved initial scope.
- Keep generated API details aligned with `openapi.json`; write narrative guidance in MDX.

## Style

- Use active voice and second person.
- Use sentence-case headings and concise sentences.
- Use root-relative internal links without file extensions.
- Add a language tag to every code block.
- Format file names, commands, paths, and code references as code.

## Verification

- Use Node.js 24.15.0 and Mintlify CLI 4.2.775.
- Run `npm test` for focused repository tests.
- Run `npm run check` before handoff.
- The production deployment branch is `main`.
