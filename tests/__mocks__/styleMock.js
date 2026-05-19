// Jest moduleNameMapper target for *.css / *.scss / *.less / *.sass imports.
// taskpane.js does `import "./taskpane.css"` for the bundler — under jsdom
// there is no real stylesheet loader, so we return an empty object so the
// import resolves to a no-op instead of throwing "Unexpected token .".
module.exports = {};
