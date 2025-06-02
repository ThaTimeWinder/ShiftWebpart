// .eslintrc.js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: ["./tsconfig.json"]
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
    // fjernet: "@microsoft/spfx"
  ],
  rules: {
    // eventuelle egne regel-overrides, fx:
     "@typescript-eslint/no-explicit-any": "off",
     "@typescript-eslint/no-require-imports": "off"
  }
};