# Amigro project rules

- Plain HTML, CSS, and vanilla JavaScript. No frameworks, build step, or application backend.
- No backend, app login, or uploaded personal documents.
- All user-facing content, steps, deadlines, packing lists, and source links belong in `data/steps.json`. Never hardcode content in the UI.
- Keep the design calm and simple, with plain English, large tap targets, scalable text, and no emojis.
- Mark uncertain factual content with the exact words `TO VERIFY`. Verify bureaucracy guidance against official sources and keep review dates honest.
- Hydrate storage before allowing changes. Preserve visible storage errors and serialize writes.
- Keep the app to one page with simple views, designed for a mobile width of 375 px first.
- After every task, explain in exactly three lines what changed and how to test it in a browser. Be clear about checks that were actually run.
