// @toast-ui/editor's package.json `exports` map omits a "types" condition,
// so consumers using "bundler"/"node16" module resolution (this repo's
// default everywhere) can't resolve its .d.ts files through normal package
// resolution even though they ship in the package. This shim re-declares
// the two subpaths we import, pointing straight at the real type files —
// referenced from Docs.tsx so it's pulled into any consumer's program
// (this package's own tsc, or a consumer like apps/desktop's).
/// <reference path="../node_modules/@toast-ui/editor/types/toastui-editor-viewer.d.ts" />

declare module "@toast-ui/editor" {
  export * from "../node_modules/@toast-ui/editor/types/index";
  export { default } from "../node_modules/@toast-ui/editor/types/index";
}
