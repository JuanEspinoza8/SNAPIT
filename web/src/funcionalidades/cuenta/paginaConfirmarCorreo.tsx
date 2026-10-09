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

  const error = confirmar.isError ? aErrorApi(confirmar.error) : null;

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

      {error && (
        <>
          {/* Un enlace usado, vencido o inválido da siempre el mismo error: reintentar no sirve. */}
          <AvisoError
            error={error}
            alReintentar={error.codigo.startsWith('ENLACE_') ? undefined : () => confirmar.mutate(token)}
          />
          <div className="flex flex-wrap gap-2">
            <Link
              to="/ingreso"
              className="inline-block rounded-md border border-borde px-4 py-2 text-sm font-semibold text-primario"
            >
              Volver al ingreso
            </Link>
            {error.codigo === 'ENLACE_VENCIDO' && (
              <Link
                to="/recuperar-clave"
                className="inline-block rounded-md border border-borde px-4 py-2 text-sm font-semibold text-primario"
              >
                Olvidé mi clave
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
