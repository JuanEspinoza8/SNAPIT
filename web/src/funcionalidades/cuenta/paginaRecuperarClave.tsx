import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useRecuperarClave } from './useRecuperarClave.js';
import { validarCorreo } from './validaciones.js';

export function PaginaRecuperarClave() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);
  const recuperar = useRecuperarClave();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validado = validarCorreo(email);
    setError(validado);
    setAviso(false);
    if (validado) return;
    recuperar.mutate(
      { email: email.trim() },
      {
        onError: (causa) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(causa), { email: 'email' });
          setError(porCampo.email ?? null);
          setAviso(sinCampo);
        },
      },
    );
  }

  if (recuperar.isSuccess) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Revisá tu correo</h1>
        <p className="text-texto-secundario">
          Si hay una cuenta con <strong className="text-texto">{email.trim()}</strong>, te enviamos un enlace
          para elegir una clave nueva. Vence en una hora. Después volvé a ingresar con la clave nueva.
        </p>
        <Link
          to="/ingreso"
          className="inline-block rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
        >
          Volver al ingreso
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-texto">Olvidé mi clave</h1>
        <p className="text-texto-secundario">
          Escribí el correo de tu cuenta y te enviamos un enlace para elegir una clave nueva.
        </p>
      </header>

      <form onSubmit={enviar} className="space-y-4" noValidate>
        <Campo
          id="email"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          placeholder="tunombre@ejemplo.com"
          value={email}
          onChange={(evento) => {
            setEmail(evento.target.value);
            setError(null);
          }}
          onBlur={() => {
            if (email) setError(validarCorreo(email));
          }}
          error={error}
        />

        {recuperar.isError && aviso && <AvisoError error={aErrorApi(recuperar.error)} />}

        <button
          type="submit"
          disabled={recuperar.isPending}
          className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {recuperar.isPending ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>

      <p className="text-center text-sm text-texto-secundario">
        <Link to="/ingreso" className="font-semibold text-primario hover:underline">
          Volver al ingreso
        </Link>
      </p>
    </section>
  );
}
