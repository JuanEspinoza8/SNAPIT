import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { useConfirmarCorreo } from './useConfirmarCorreo.js';

export function PaginaConfirmarCorreo() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const confirmar = useConfirmarCorreo();
  const disparado = useRef(false);

  // El link de un correo sirve una sola vez: en desarrollo StrictMode monta
  // dos veces el efecto, así que solo se dispara el primero (ref).
  useEffect(() => {
    if (disparado.current || !token) return;
    disparado.current = true;
    confirmar.mutate(token);
  }, [token, confirmar]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Confirmar correo</h1>
        <p className="text-texto-secundario">
          El link está incompleto. Abrí el correo y tocá el enlace completo.
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
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-texto">Confirmar correo</h1>

      {confirmar.isPending && <p className="text-texto-secundario">Confirmando tu correo…</p>}

      {confirmar.isSuccess && (
        <>
          <p className="text-texto-secundario">Correo confirmado. Ya podés ingresar.</p>
          <Link
            to="/ingreso"
            className="inline-block rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
          >
            Ir al ingreso
          </Link>
        </>
      )}

      {confirmar.isError && (
        <>
          <AvisoError
            error={aErrorApi(confirmar.error)}
            alReintentar={() => confirmar.mutate(token)}
            reintentando={confirmar.isPending}
          />
          <Link
            to="/ingreso"
            className="inline-block rounded-md border border-borde px-4 py-2 text-sm font-semibold text-primario"
          >
            Volver al ingreso
          </Link>
        </>
      )}
    </section>
  );
}
