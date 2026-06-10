/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.ico' {
  const content: string;
  export default content;
}

// Make Electron's <webview> a valid JSX intrinsic element.
// Only available at runtime when running inside Electron with webviewTag: true.
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: boolean | string;
        nodeintegration?: boolean | string;
        useragent?: string;
        preload?: string;
        httpreferrer?: string;
        autosize?: boolean | string;
        disablewebsecurity?: boolean | string;
      },
      HTMLElement
    >;
  }
}
