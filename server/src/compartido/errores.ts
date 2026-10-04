/** Error esperado: se responde al cliente con su código y mensaje. */
export class ErrorApp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}
