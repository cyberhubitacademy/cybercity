// Vite `?raw` imports of mission sources.
declare module '*.scm?raw' {
  const source: string;
  export default source;
}
