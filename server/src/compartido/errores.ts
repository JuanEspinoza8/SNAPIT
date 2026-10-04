/** Un problema puntual de la entrada, por ejemplo un campo inválido. */
export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Error esperado: se responde al cliente con su código y mensaje. */
export class ErrorApp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles?: DetalleError[],
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}
