import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useRegistro } from './useRegistro.js';
import { validarClaveNueva, validarCorreo, validarNombre } from './validaciones.js';

type Errores = { nombre: string | null; email: string | null; clave: string | null };

export function PaginaRegistro() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [errores, setErrores] = useState<Errores>({ nombre: null, email: null, clave: null });
  const registro = useRegistro();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados = {
      nombre: validarNombre(nombre),
      email: validarCorreo(email),
      clave: validarClaveNueva(clave),
    };
    setErrores(validados);
    if (validados.nombre || validados.email || validados.clave) return;
    registro.mutate({ nombre, email, clave });
  }

  if (registro.isSuccess) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Revisá tu correo</h1>
        <p className="text-texto-secundario">
          Te mandamos un link a <strong className="text-texto">{email}</strong> para confirmar la cuenta.
          Después ya podés ingresar.
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
        <h1 className="text-2xl font-semibold text-texto">Crear cuenta</h1>
        <p className="text-texto-secundario">
          Es gratis. Vas a necesitar confirmar tu correo para poder ingresar.
        </p>
      </header>

      <form onSubmit={enviar} className="space-y-4" noValidate>
        <Campo
          id="nombre"
          etiqueta="Nombre"
          autoComplete="name"
          placeholder="Tu nombre"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          error={errores.nombre}
        />
        <Campo
          id="email"
          etiqueta="Correo"
          type="email"
          autoComplete="email"
          placeholder="tunombre@ejemplo.com"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          error={errores.email}
        />
        <Campo
          id="clave"
          etiqueta="Clave"
          type="password"
          autoComplete="new-password"
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          error={errores.clave}
        />

        {registro.isError && <AvisoError error={aErrorApi(registro.error)} />}

        <button
          type="submit"
          disabled={registro.isPending}
          className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {registro.isPending ? 'Registrando…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="text-center text-sm text-texto-secundario">
        ¿Ya tenés cuenta?{' '}
        <Link to="/ingreso" className="font-semibold text-primario hover:underline">
          Ingresá
        </Link>
      </p>
    </section>
  );
}
