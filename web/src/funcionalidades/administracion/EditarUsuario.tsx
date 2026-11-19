import { useState } from 'react';
import type { FormEvent } from 'react';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import type { Usuario } from '../../compartido/sesion/usuario.js';
import { validarNombre } from '../cuenta/validaciones.js';
import type { DatosModificacionUsuario, Organismo } from './tipos.js';
import type { useAdministracion } from './useAdministracion.js';

type Rol = Usuario['rol'];
type Errores = { nombre: string | null; organismo: string | null; area: string | null };
const SIN_ERRORES: Errores = { nombre: null, organismo: null, area: null };
const CAMPOS_API: Record<string, keyof Errores> = {
  nombre: 'nombre',
  organismoId: 'organismo',
  areaId: 'area',
};

interface Props {
  usuario: Usuario;
  organismos: Organismo[];
  modificar: ReturnType<typeof useAdministracion>['modificarUsuario'];
  alTerminar: () => void;
}

/**
 * Cambia el nombre, el rol y dónde trabaja un usuario. Si cambian sus permisos, el servidor cierra sus sesiones:
 * se avisa antes de guardar, para que no sorprenda.
 */
export function EditarUsuario({ usuario, organismos, modificar, alTerminar }: Props) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [organismoId, setOrganismoId] = useState(usuario.organismoId ? String(usuario.organismoId) : '');
  const [areaId, setAreaId] = useState(usuario.areaId ? String(usuario.areaId) : '');
  const [errores, setErrores] = useState<Errores>(SIN_ERRORES);
  const [aviso, setAviso] = useState(false);

  const organismo = organismos.find((o) => o.id === Number(organismoId)) ?? null;
  const cambiaPermisos =
    rol !== usuario.rol ||
    (Number(organismoId) || null) !== usuario.organismoId ||
    (rol === 'OPERADOR' ? Number(areaId) || null : null) !== usuario.areaId;

  function guardar(evento: FormEvent) {
    evento.preventDefault();
    const organismoElegido = Number(organismoId) || null;
    const validados: Errores = {
      nombre: validarNombre(nombre),
      organismo: rol === 'OPERADOR' && organismoElegido === null ? 'Es obligatorio' : null,
      area: null,
    };
    setErrores(validados);
    setAviso(false);
    if (validados.nombre || validados.organismo) return;

    const datos: DatosModificacionUsuario =
      rol === 'VECINO'
        ? { nombre: nombre.trim(), rol, organismoId: null, areaId: null }
        : rol === 'OPERADOR'
          ? { nombre: nombre.trim(), rol, organismoId: organismoElegido!, areaId: Number(areaId) || null }
          : { nombre: nombre.trim(), rol, organismoId: organismoElegido, areaId: null };
    modificar.mutate(
      { id: usuario.id, datos },
      {
        onSuccess: alTerminar,
        onError: (error) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(error), CAMPOS_API);
          setErrores({ ...SIN_ERRORES, ...porCampo });
          setAviso(sinCampo);
        },
      },
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-4" noValidate>
      <p className="text-sm text-texto-secundario">{usuario.email}</p>
      <Campo
        id="editar-nombre"
        etiqueta="Nombre"
        value={nombre}
        onChange={(evento) => {
          setNombre(evento.target.value);
          setErrores((previos) => ({ ...previos, nombre: null }));
        }}
        error={errores.nombre}
      />
      <CampoSelecto
        id="editar-rol"
        etiqueta="Rol"
        value={rol}
        onChange={(evento) => {
          const elegido = evento.target.value as Rol;
          setRol(elegido);
          if (elegido === 'VECINO') setOrganismoId('');
          if (elegido !== 'OPERADOR') setAreaId('');
        }}
      >
        <option value="VECINO">Vecino</option>
        <option value="OPERADOR">Operador</option>
        <option value="ADMINISTRADOR">Administrador</option>
      </CampoSelecto>
      {rol !== 'VECINO' && (
        <CampoSelecto
          id="editar-organismo"
          etiqueta={rol === 'OPERADOR' ? 'Organismo' : 'Organismo (opcional)'}
          value={organismoId}
          onChange={(evento) => {
            setOrganismoId(evento.target.value);
            setAreaId('');
            setErrores((previos) => ({ ...previos, organismo: null, area: null }));
          }}
          error={errores.organismo}
        >
          <option value="">{rol === 'OPERADOR' ? 'Elegí un organismo' : 'Sin organismo'}</option>
          {organismos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </CampoSelecto>
      )}
      {rol === 'OPERADOR' && organismo && (
        <CampoSelecto
          id="editar-area"
          etiqueta="Área (opcional)"
          value={areaId}
          onChange={(evento) => setAreaId(evento.target.value)}
          error={errores.area}
        >
          <option value="">Sin área: ve todo el organismo</option>
          {organismo.areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nombre}
            </option>
          ))}
        </CampoSelecto>
      )}
      {cambiaPermisos && (
        <p className="text-sm text-texto-secundario">
          Al cambiar su rol o dónde trabaja, se cierran sus sesiones: va a tener que volver a ingresar.
        </p>
      )}
      {modificar.isError && aviso && <AvisoError error={aErrorApi(modificar.error)} />}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={alTerminar}
          className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-texto hover:bg-superficie-alterna"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={modificar.isPending}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {modificar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
