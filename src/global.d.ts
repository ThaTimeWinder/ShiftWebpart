// src/global.d.ts

// Sig til TS, at enhver .module.scss kan importeres som et modul
declare module '*.module.scss' {
    const classes: { [key: string]: string };
    export default classes;
  }
  