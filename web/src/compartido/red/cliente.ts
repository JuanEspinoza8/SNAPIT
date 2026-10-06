import { ErrorApi, aErrorApi, leerError } from './error.js';
import type { AlmacenSesion } from './sesion.js';

export interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  /** Petición pública: no lleva token y no dispara la renovación. */
  sinSesion?: boolean;
  señal?: AbortSignal;
}

export interface ClienteApi {
  pedir<T>(ruta: string, opciones?: OpcionesPeticion): Promise<T>;
}

export function crearClienteApi(config: {
  urlBase: string;
  almacen: AlmacenSesion;
  /** Se llama cuando la sesión ya no sirve, después de borrar los tokens. */
  alPerderSesion?: () => void;
}): ClienteApi {
  const { urlBase, almacen, alPerderSesion } = config;

  // El token de renovación es de un solo uso y el servidor rota uno nuevo en
  // cada renovación (docs/api.md). Si dos peticiones reciben 401 a la vez, la
  // segunda espera esta misma renovación en lugar de gastar un token vencido.
  let renovacionEnCurso: Promise<string> | null = null;

  async function enviar(ruta: string, opciones: OpcionesPeticion, token: string | null) {
    const cabeceras: Record<string, string> = {};
    if (token) cabeceras.Authorization = `Bearer ${token}`;
    if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    // 'salud' y '/salud' son la misma ruta: sin la barra, urlBase + ruta daría '/apisalud'.
    const camino = ruta.startsWith('/') ? ruta : `/${ruta}`;
    return fetch(`${urlBase}${camino}`, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      signal: opciones.señal,
    });
  }

  async function interpretar<T>(respuesta: Response): Promise<T> {
    if (respuesta.status === 204) return undefined as T;
    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (!respuesta.ok) {
      throw leerError(respuesta.status, cuerpo, respuesta.headers.get('x-request-id'));
    }
    return cuerpo as T;
  }

  function descartar(): never {
    almacen.borrar();
    alPerderSesion?.();
    throw new ErrorApi('La sesión no sirve. Vuelve a ingresar.', 'SIN_SESION');
  }

  async function renovar(): Promise<string> {
    const tokenRenovacion = almacen.leer()?.tokenRenovacion;
    if (!tokenRenovacion) return descartar();

    try {
      const respuesta = await enviar(
        '/auth/renovar',
        { metodo: 'POST', cuerpo: { tokenRenovacion }, sinSesion: true },
        null,
      );
      if (respuesta.status < 400) {
        const cuerpo = await respuesta.json();
        const tokenAcceso = cuerpo?.tokenAcceso;
        const nuevoRenovacion = cuerpo?.tokenRenovacion;
        if (typeof tokenAcceso !== 'string' || typeof nuevoRenovacion !== 'string') {
          return descartar();
        }
        // Se guardan los dos: el token de renovación nuevo reemplaza al viejo.
        almacen.guardar({ tokenAcceso, tokenRenovacion: nuevoRenovacion });
        return tokenAcceso;
      }
      // Si el servidor rechazó la renovación, la sesión ya no sirve. Con un 5xx
      // se conserva para otro intento.
      if (respuesta.status < 500) return descartar();
      throw leerError(respuesta.status, await respuesta.json().catch(() => null));
    } catch (error) {
      throw aErrorApi(error);
    }
  }

  async function tokenParaReintentar(tokenUsado: string): Promise<string> {
    const guardado = almacen.leer();
    if (!guardado) return descartar();
    if (guardado.tokenAcceso !== tokenUsado) return guardado.tokenAcceso;
    renovacionEnCurso ??= renovar().finally(() => {
      renovacionEnCurso = null;
    });
    return renovacionEnCurso;
  }

  return {
    async pedir<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
      const tokenUsado = opciones.sinSesion ? null : (almacen.leer()?.tokenAcceso ?? null);
      const respuesta = await enviar(ruta, opciones, tokenUsado);

      // Solo renueva si la respuesta fue 401 y la petición llevaba token.
      // Un 403 es "no tenés permiso": la sesión es válida.
      if (respuesta.status !== 401 || tokenUsado === null) {
        return interpretar<T>(respuesta);
      }

      let tokenNuevo: string;
      try {
        tokenNuevo = await tokenParaReintentar(tokenUsado);
      } catch {
        return interpretar<T>(respuesta); // la renovación falló: se devuelve el 401 original
      }

      // Reintento único: no hay reintentos encadenados.
      return interpretar<T>(await enviar(ruta, opciones, tokenNuevo));
    },
  };
}
