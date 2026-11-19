// heic-decode no trae tipos: lo que usa el servidor (compartido/analisisFoto.ts).
declare module 'heic-decode' {
  interface ImagenDecodificada {
    width: number;
    height: number;
    /** Píxeles RGBA, 4 bytes por píxel. */
    data: Uint8ClampedArray;
  }
  export default function decode(opciones: { buffer: Buffer | ArrayBufferLike }): Promise<ImagenDecodificada>;
}
