// src/types/custom.d.ts
declare module '*.module.scss' {
    const styles: { [className: string]: string };
    export default styles;
  }
  