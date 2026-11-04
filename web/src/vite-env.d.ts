interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MSW?: string;
}

// Vite sirve las imágenes importadas desde src/ con un nombre con hash: el import da su URL.
declare module '*.png' {
  const url: string;
  export default url;
}
