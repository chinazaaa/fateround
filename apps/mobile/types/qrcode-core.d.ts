// `@types/qrcode` only declares the top-level `qrcode` entrypoint. GameLinkQrCode
// imports the core-only subpath `qrcode/lib/core/qrcode` (to avoid the Node
// canvas/png code paths that break in React Native), which has no bundled types.
// Map that subpath to the same create()/QRCode types so it stays type-safe
// instead of falling back to `any` (TS7016 under strict mode).
declare module 'qrcode/lib/core/qrcode' {
  const QRCode: {
    create(
      text: string | import('qrcode').QRCodeSegment[],
      options?: import('qrcode').QRCodeOptions
    ): import('qrcode').QRCode
  }
  export default QRCode
}
