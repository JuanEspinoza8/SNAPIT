export interface Tokens {
  tokenAcceso: string;
  tokenRenovacion: string;
}

export interface AlmacenSesion {
  leer(): Tokens | null;
  guardar(tokens: Tokens): void;
  borrar(): void;
}

const claveAcceso = 'snapit:tokenAcceso';
const claveRenovacion = 'snapit:tokenRenovacion';

/** Guarda los tokens en localStorage: la sesión sigue al recargar el
 *  navegador (docs/api.md). */
export function crearAlmacenSesion(): AlmacenSesion {
  return {
    leer() {
      const tokenAcceso = localStorage.getItem(claveAcceso);
      const tokenRenovacion = localStorage.getItem(claveRenovacion);
      if (!tokenAcceso || !tokenRenovacion) return null;
      return { tokenAcceso, tokenRenovacion };
    },
    guardar(tokens) {
      localStorage.setItem(claveAcceso, tokens.tokenAcceso);
      localStorage.setItem(claveRenovacion, tokens.tokenRenovacion);
    },
    borrar() {
      localStorage.removeItem(claveAcceso);
      localStorage.removeItem(claveRenovacion);
    },
  };
}
