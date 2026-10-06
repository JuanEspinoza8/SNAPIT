import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useRestablecerClave } from './useRestablecerClave.js';
import { validarClaveNueva } from './validaciones.js';

export function PaginaRestablecerClave() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const restablecer = useRestablecerClave();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validado = validarClaveNueva(clave);
    setError(validado);
    if (validado) return;
    restablecer.mutate({ token, clave });
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Elegir clave nueva</h1>
        <p className="text-texto-secundario">
          El link está incompleto. Abrí el correo y tocá el enlace completo, o pedí otro con «Olvidé mi
          clave».
        </p>
        <Link
          to="/recuperar-clave"
          className="inline-block rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Volver a pedir un enlace
        </Link>
      </section>
    );
  }

  if (restablecer.isSuccess) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Clave nueva lista</h1>
        <p className="text-texto-secundario">
          Ya podés ingresar con la clave nueva. Las otras sesiones de tu cuenta se cerraron.
        </p>
        <Link
          to="/ingreso"
          className="inline-block rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Ir al ingreso
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-texto">Elegir clave nueva</h1>
        <p className="text-texto-secundario">Elegí una clave que no hayas usado antes.</p>
      </header>

      <form onSubmit={enviar} className="space-y-4" noValidate>
        <Campo
          id="clave"
          etiqueta="Clave nueva"
          type="password"
          autoComplete="new-password"
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          error={error}
        />
        <p className="text-sm text-texto-secundario">
          Mínimo 8 caracteres. Si el enlace venció o no sirve, el mensaje acá abajo te dice qué hacer.
        </p>

        {restablecer.isError && <AvisoError error={aErrorApi(restablecer.error)} />}

        <button
          type="submit"
          disabled={restablecer.isPending}
          className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {restablecer.isPending ? 'Guardando…' : 'Cambiar mi clave'}
        </button>
      </form>
    </section>
  );
}
