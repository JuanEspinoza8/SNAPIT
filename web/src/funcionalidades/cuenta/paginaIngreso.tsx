import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useIngreso } from './useIngreso.js';
import { validarClaveIngresada, validarCorreo } from './validaciones.js';

type Errores = { email: string | null; clave: string | null };

const SIN_ERRORES: Errores = { email: null, clave: null };

export function PaginaIngreso() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [errores, setErrores] = useState<Errores>(SIN_ERRORES);
  const [aviso, setAviso] = useState(false);
  const ingreso = useIngreso();

  function marcar(campo: keyof Errores, error: string | null) {
    setErrores((previos) => ({ ...previos, [campo]: error }));
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados = { email: validarCorreo(email), clave: validarClaveIngresada(clave) };
    setErrores(validados);
    setAviso(false);
    if (validados.email || validados.clave) return;
    ingreso.mutate(
      { email, clave },
      {
        onError: (error) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(error), {
            email: 'email',
            clave: 'clave',
          });
          setErrores({ ...SIN_ERRORES, ...porCampo });
          setAviso(sinCampo);
        },
      },
    );
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-texto">Ingresar</h1>
        <p className="text-texto-secundario">Entrá con el correo y la clave de tu cuenta.</p>
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
            marcar('email', null);
          }}
          onBlur={() => {
            if (email) marcar('email', validarCorreo(email));
          }}
          error={errores.email}
        />
        <Campo
          id="clave"
          etiqueta="Clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(evento) => {
            setClave(evento.target.value);
            marcar('clave', null);
          }}
          error={errores.clave}
        />

        {ingreso.isError && aviso && <AvisoError error={aErrorApi(ingreso.error)} />}

        <button
          type="submit"
          disabled={ingreso.isPending}
          className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {ingreso.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      <p className="text-center text-sm">
        <Link to="/recuperar-clave" className="font-semibold text-primario hover:underline">
          Olvidé mi clave
        </Link>
      </p>

      <p className="text-center text-sm text-texto-secundario">
        ¿No tenés cuenta?{' '}
        <Link to="/registro" className="font-semibold text-primario hover:underline">
          Registrate
        </Link>
      </p>
    </section>
  );
}
