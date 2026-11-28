// React is loaded once from the CDN (UMD build) and shared by the console and the store.
declare const window: { React: unknown };
module.exports = window.React;
