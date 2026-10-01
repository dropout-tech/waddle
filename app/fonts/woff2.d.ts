// Font files imported for <link rel="preload">: the bundler returns their public URL.
declare module '*.woff2' {
  const src: string
  export default src
}
