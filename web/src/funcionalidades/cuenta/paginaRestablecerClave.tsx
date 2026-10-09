import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useRestablecerClave } from './useRestablecerClave.js';
import { validarClaveNueva } from './validaciones.js';

export function PaginaRestablecerClave() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);
  const restablecer = useRestablecerClave();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validado = validarClaveNueva(clave);
    setError(validado);
    setAviso(false);
    if (validado) return;
    restablecer.mutate(
      { token, clave },
      {
        onError: (causa) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(causa), { clave: 'clave' });
          setError(porCampo.clave ?? null);
          setAviso(sinCampo);
        },
      },
    );
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

  const errorDelEnlace = restablecer.isError && aErrorApi(restablecer.error).codigo.startsWith('ENLACE_');

  return (
    <section className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-texto">Elegir clave nueva</h1>
        <p className="text-texto-secundario">Escribí la clave nueva de tu cuenta.</p>
      </header>

      <form onSubmit={enviar} className="space-y-4" noValidate>
        <Campo
          id="clave"
          etiqueta="Clave nueva"
          type="password"
          autoComplete="new-password"
          value={clave}
          onChange={(evento) => {
            setClave(evento.target.value);
            setError(null);
          }}
          onBlur={() => {
            if (clave) setError(validarClaveNueva(clave));
          }}
          error={error}
        />
        <p className="text-sm text-texto-secundario">Mínimo 8 caracteres.</p>

        {restablecer.isError && aviso && <AvisoError error={aErrorApi(restablecer.error)} />}

        {errorDelEnlace ? (
          <Link
            to="/recuperar-clave"
            className="block w-full rounded-md bg-primario px-4 py-2 text-center text-sm font-semibold text-sobre-primario hover:opacity-90"
          >
            Pedir un enlace nuevo
          </Link>
        ) : (
          <button
            type="submit"
            disabled={restablecer.isPending}
            className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
          >
            {restablecer.isPending ? 'Guardando…' : 'Cambiar mi clave'}
          </button>
        )}
      </form>
    </section>
  );
}
