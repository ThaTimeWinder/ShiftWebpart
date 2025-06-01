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
    "plugin:@typescript-eslint/recommended",
    "@microsoft/spfx"
  ],
  rules: {
    // Add any custom rule overrides here, for example:
    "@typescript-eslint/no-explicit-any": "off"
  }
};
