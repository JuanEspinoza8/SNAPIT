import { useState } from 'react';
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { validarClaveNueva, validarCorreo, validarNombre } from '../cuenta/validaciones.js';
import type { Organismo, RolDeAlta } from './tipos.js';
import type { Usuario } from '../../compartido/sesion/usuario.js';
import { useAdministracion } from './useAdministracion.js';

type Errores = {
  nombre: string | null;
  email: string | null;
  clave: string | null;
  organismo: string | null;
  area: string | null;
};

const ERRORES_VACIOS: Errores = {
  nombre: null,
  email: null,
  clave: null,
  organismo: null,
  area: null,
};

const TEXTO_ROL: Record<Usuario['rol'], string> = {
  VECINO: 'Vecino',
  OPERADOR: 'Operador',
  ADMINISTRADOR: 'Administrador',
};

export function PaginaAltaOperador() {
  const { organismos: consultaOrganismos, usuarios: consultaUsuarios, crearUsuario } = useAdministracion();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [rol, setRol] = useState<RolDeAlta>('OPERADOR');
  const [organismoId, setOrganismoId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [errores, setErrores] = useState<Errores>(ERRORES_VACIOS);
  const [aviso, setAviso] = useState(false);

  const todosLosOrganismos: Organismo[] = consultaOrganismos.data?.organismos ?? [];
  const organismoElegido = todosLosOrganismos.find((o) => o.id === Number(organismoId)) ?? null;
  const areas = organismoElegido?.areas ?? [];

  // Cada campo limpia su error al editar: un aviso del servidor no clava un
  // dato que se corrigió en la pantalla, y no se pierde nada de lo cargado.
  function alCambiar(campo: keyof Errores, fijar: Dispatch<SetStateAction<string>>) {
    return (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      fijar(evento.target.value);
      setErrores((previos) => ({ ...previos, [campo]: null }));
    };
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Alta de operadores</h1>
        <p className="text-texto-secundario">
          Creá la cuenta de un operador o administrador con una clave inicial. Lo cargado no se pierde si el
          servidor rechaza algo.
        </p>
      </div>

      {crearUsuario.isSuccess && (
        <div
          role="status"
          className="rounded-md border border-primario bg-superficie-alterna p-3 text-sm text-primario"
        >
          {rol === 'OPERADOR' ? 'Operador dado de alta' : 'Administrador dado de alta'}. Ya puede ingresar con
          la clave inicial.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={(evento) => enviar(evento)} className="space-y-4" noValidate>
          <Campo
            id="nombre"
            etiqueta="Nombre"
            autoComplete="off"
            placeholder="Nombre del operador"
            value={nombre}
            onChange={alCambiar('nombre', setNombre)}
            error={errores.nombre}
          />
          <Campo
            id="email"
            etiqueta="Correo"
            type="email"
            autoComplete="off"
            placeholder="operador@ejemplo.com"
            value={email}
            onChange={alCambiar('email', setEmail)}
            error={errores.email}
          />
          <Campo
            id="clave"
            etiqueta="Clave inicial"
            type="password"
            autoComplete="new-password"
            value={clave}
            onChange={alCambiar('clave', setClave)}
            error={errores.clave}
          />
          <CampoSelecto
            id="rol"
            etiqueta="Rol"
            value={rol}
            onChange={(evento) => {
              const elegido = evento.target.value as RolDeAlta;
              setRol(elegido);
              setErrores((previos) => ({ ...previos, area: null }));
              if (elegido === 'ADMINISTRADOR') setAreaId('');
            }}
          >
            <option value="OPERADOR">Operador</option>
            <option value="ADMINISTRADOR">Administrador</option>
          </CampoSelecto>
          <CampoSelecto
            id="organismo"
            etiqueta={rol === 'OPERADOR' ? 'Organismo' : 'Organismo (opcional)'}
            value={organismoId}
            onChange={alCambiar('organismo', setOrganismoId)}
            error={errores.organismo}
            disabled={consultaOrganismos.isPending}
          >
            {consultaOrganismos.isPending ? (
              <option value="">Cargando organismos…</option>
            ) : (
              <>
                <option value="">{rol === 'OPERADOR' ? 'Elegí un organismo' : 'Sin organismo'}</option>
                {todosLosOrganismos.map((organismo) => (
                  <option key={organismo.id} value={organismo.id}>
                    {organismo.nombre}
                  </option>
                ))}
              </>
            )}
          </CampoSelecto>

          {rol === 'OPERADOR' && (
            <CampoSelecto
              id="area"
              etiqueta="Área"
              value={areaId}
              onChange={alCambiar('area', setAreaId)}
              error={errores.area}
              disabled={!organismoElegido}
            >
              {!organismoElegido ? (
                <option value="">Primero elegí un organismo</option>
              ) : areas.length === 0 ? (
                <option value="">El organismo no tiene áreas activas</option>
              ) : (
                <>
                  <option value="">Elegí un área</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nombre}
                    </option>
                  ))}
                </>
              )}
            </CampoSelecto>
          )}

          {consultaOrganismos.isError && (
            <AvisoError
              error={aErrorApi(consultaOrganismos.error)}
              alReintentar={() => void consultaOrganismos.refetch()}
              reintentando={consultaOrganismos.isFetching}
            />
          )}

          {crearUsuario.isError && aviso && <AvisoError error={aErrorApi(crearUsuario.error)} />}

          <button
            type="submit"
            disabled={crearUsuario.isPending}
            className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
          >
            {crearUsuario.isPending ? 'Dando de alta…' : 'Dar de alta'}
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-texto">Usuarios</h2>
          {consultaUsuarios.isError && (
            <AvisoError
              error={aErrorApi(consultaUsuarios.error)}
              alReintentar={() => void consultaUsuarios.refetch()}
              reintentando={consultaUsuarios.isFetching}
            />
          )}
          {consultaUsuarios.isPending && <p className="text-sm text-texto-secundario">Cargando usuarios…</p>}
          {consultaUsuarios.data && (
            <ul className="divide-y divide-borde rounded-md border border-borde">
              {consultaUsuarios.data.usuarios.map((usuario) => (
                <li key={usuario.id} className="flex items-baseline justify-between gap-4 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-texto">{usuario.nombre}</p>
                    <p className="truncate text-texto-secundario">{usuario.email}</p>
                  </div>
                  <div className="shrink-0 text-right text-texto-secundario">
                    <p className="font-medium text-texto-secundario">{TEXTO_ROL[usuario.rol]}</p>
                    <p className="text-xs">
                      {nombreOrganismo(usuario, todosLosOrganismos)}
                      {usuario.areaId ? ` · ${nombreArea(usuario, todosLosOrganismos)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const organismo = Number(organismoId) || null;
    const area = Number(areaId) || null;
    const validados: Errores = {
      nombre: validarNombre(nombre),
      email: validarCorreo(email),
      clave: validarClaveNueva(clave),
      organismo: rol === 'OPERADOR' && organismo === null ? 'Es obligatorio' : null,
      area: rol === 'OPERADOR' && area === null ? 'Es obligatoria' : null,
    };
    setErrores(validados);
    setAviso(false);
    if (validados.nombre || validados.email || validados.clave || validados.organismo || validados.area) {
      return;
    }

    const base = { email: email.trim(), clave, nombre: nombre.trim() };
    crearUsuario.mutate(
      rol === 'OPERADOR'
        ? { ...base, rol, organismoId: organismo as number, areaId: area as number }
        : { ...base, rol, organismoId: organismo, areaId: null },
      {
        onSuccess: () => {
          setNombre('');
          setEmail('');
          setClave('');
          setAreaId('');
          setErrores(ERRORES_VACIOS);
        },
        onError: (error) => {
          const api = aErrorApi(error);
          const porCampo = new Map(api.detalles.map((detalle) => [detalle.campo, detalle.mensaje]));
          const siguientes: Errores = {
            ...ERRORES_VACIOS,
            nombre: porCampo.get('nombre') ?? null,
            email: porCampo.get('email') ?? null,
            clave: porCampo.get('clave') ?? null,
            organismo: porCampo.get('organismoId') ?? null,
            area: porCampo.get('areaId') ?? null,
          };
          if (api.codigo === 'EMAIL_EN_USO') siguientes.email = api.mensaje;
          setErrores(siguientes);
          // El aviso general solo si el error no encontró el campo dónde caer.
          setAviso(api.detalles.length === 0 && api.codigo !== 'EMAIL_EN_USO');
        },
      },
    );
  }
}

function nombreOrganismo(usuario: Usuario, organismos: Organismo[]): string {
  return organismos.find((o) => o.id === usuario.organismoId)?.nombre ?? 'Sin organismo';
}

function nombreArea(usuario: Usuario, organismos: Organismo[]): string {
  const organismo = organismos.find((o) => o.id === usuario.organismoId);
  return organismo?.areas.find((a) => a.id === usuario.areaId)?.nombre ?? '';
}
