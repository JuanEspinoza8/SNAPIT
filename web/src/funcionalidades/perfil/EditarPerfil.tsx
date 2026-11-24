import { useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { Modal } from '../../compartido/componentes/Modal.js';
import { useAlmacen, useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi, type ErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { crearRepositorioAuth } from '../../compartido/red/repositorioAuth.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import type { Usuario } from '../../compartido/sesion/usuario.js';
import { validarClaveNueva, validarNombre } from '../cuenta/validaciones.js';

const BOTON =
  'rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-60';

function useRepositorio() {
  const cliente = useCliente();
  return useMemo(() => crearRepositorioAuth(cliente), [cliente]);
}

/** «Editar perfil»: el nombre visible y la contraseña, cada uno con su botón. El correo no se cambia. */
export function EditarPerfil({ usuario, alCerrar }: { usuario: Usuario; alCerrar: () => void }) {
  return (
    <Modal titulo="Editar perfil" ancho="max-w-lg" alCerrar={alCerrar}>
      <div className="flex flex-col gap-6">
        <FormularioNombre usuario={usuario} />
        <hr className="border-borde" />
        <FormularioClave />
        <p className="text-xs text-texto-secundario">
          El correo ({usuario.email}) no se puede cambiar: es con el que ingresás.
        </p>
      </div>
    </Modal>
  );
}

function FormularioNombre({ usuario }: { usuario: Usuario }) {
  const repositorio = useRepositorio();
  const { actualizarUsuario } = useSesion();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation<{ usuario: Usuario }, ErrorApi, string>({
    mutationFn: (nuevo) =>
      repositorio.cambiarNombre(nuevo).catch((e: unknown) => Promise.reject(aErrorApi(e))),
    onSuccess: (respuesta) => actualizarUsuario(respuesta.usuario),
  });
  const delServidor = guardar.error ? repartirErrores(guardar.error, { nombre: 'nombre' as const }) : null;
  const sinCambios = nombre.trim() === usuario.nombre;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = validarNombre(nombre);
    setError(problema);
    if (!problema) guardar.mutate(nombre.trim());
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      <h3 className="font-semibold text-texto">Nombre</h3>
      <Campo
        id="perfil-nombre"
        etiqueta="Nombre visible"
        value={nombre}
        maxLength={120}
        autoComplete="name"
        onChange={(evento) => {
          setNombre(evento.target.value);
          guardar.reset();
        }}
        error={error ?? delServidor?.porCampo.nombre}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={guardar.isPending || sinCambios} className={BOTON}>
          {guardar.isPending ? 'Guardando…' : 'Guardar nombre'}
        </button>
        {guardar.isSuccess && sinCambios && (
          <p role="status" className="text-sm text-texto-secundario">
            Listo, se guardó.
          </p>
        )}
      </div>
      {guardar.error && (!delServidor || delServidor.sinCampo) && <AvisoError error={guardar.error} />}
    </form>
  );
}

type CampoClave = 'actual' | 'nueva' | 'repetida';

function FormularioClave() {
  const repositorio = useRepositorio();
  const almacen = useAlmacen();
  const { actualizarUsuario } = useSesion();
  const [valores, setValores] = useState<Record<CampoClave, string>>({ actual: '', nueva: '', repetida: '' });
  const [errores, setErrores] = useState<Partial<Record<CampoClave, string>>>({});
  const cambiar = useMutation<Awaited<ReturnType<typeof repositorio.cambiarClave>>, ErrorApi, void>({
    mutationFn: () =>
      repositorio
        .cambiarClave(valores.actual, valores.nueva)
        .catch((e: unknown) => Promise.reject(aErrorApi(e))),
    // Las otras sesiones se cerraron: esta sigue con los tokens nuevos.
    onSuccess: ({ tokenAcceso, tokenRenovacion, usuario }) => {
      almacen.guardar({ tokenAcceso, tokenRenovacion });
      actualizarUsuario(usuario);
      setValores({ actual: '', nueva: '', repetida: '' });
    },
  });
  const delServidor = cambiar.error
    ? repartirErrores<CampoClave>(cambiar.error, { claveActual: 'actual', claveNueva: 'nueva' })
    : null;

  function cambiarValor(campo: CampoClave, valor: string) {
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));
    cambiar.reset();
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const encontrados: Partial<Record<CampoClave, string>> = {};
    if (!valores.actual) encontrados.actual = 'Es obligatoria';
    const nueva = validarClaveNueva(valores.nueva);
    if (nueva) encontrados.nueva = nueva;
    if (valores.repetida !== valores.nueva) encontrados.repetida = 'No coincide con la nueva';
    setErrores(encontrados);
    if (Object.keys(encontrados).length === 0) cambiar.mutate();
  }

  const error = (campo: CampoClave) => errores[campo] ?? delServidor?.porCampo[campo];
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      <h3 className="font-semibold text-texto">Contraseña</h3>
      <Campo
        id="perfil-clave-actual"
        etiqueta="Contraseña actual"
        type="password"
        autoComplete="current-password"
        value={valores.actual}
        onChange={(evento) => cambiarValor('actual', evento.target.value)}
        error={error('actual')}
      />
      <Campo
        id="perfil-clave-nueva"
        etiqueta="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={valores.nueva}
        onChange={(evento) => cambiarValor('nueva', evento.target.value)}
        error={error('nueva')}
      />
      <Campo
        id="perfil-clave-repetida"
        etiqueta="Repetí la contraseña nueva"
        type="password"
        autoComplete="new-password"
        value={valores.repetida}
        onChange={(evento) => cambiarValor('repetida', evento.target.value)}
        error={error('repetida')}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={cambiar.isPending} className={BOTON}>
          {cambiar.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
        {cambiar.isSuccess && (
          <p role="status" className="text-sm text-texto-secundario">
            Listo. Se cerró la sesión en los otros dispositivos.
          </p>
        )}
      </div>
      {cambiar.error && (!delServidor || delServidor.sinCampo) && <AvisoError error={cambiar.error} />}
    </form>
  );
}
