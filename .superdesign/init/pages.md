# Pages / UI surfaces

## Send modal
Entry: `code/extension/src/ui/modal.tsx`
Dependencies:
- `code/extension/src/ui/mount.ts`
- `code/extension/entrypoints/content.ts` (wires showModal)

## Composer L1 hints (Slice 1.5)
Entry: `code/extension/src/ui/composer-hints.ts`
Dependencies:
- `code/extension/src/detection/l1/`
- `code/extension/src/mask/placeholder.ts`
- `code/extension/src/mask/numbering.ts`
- `code/extension/entrypoints/content.ts`
- theme tokens in `.superdesign/init/theme.md`
