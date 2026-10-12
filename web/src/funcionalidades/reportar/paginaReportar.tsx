import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useCategorias } from '../mapa/consultas.js';
import { MapaElegirPunto, type Punto } from './MapaElegirPunto.js';
import type { Severidad } from './tipos.js';
import { useReportar } from './useReportar.js';

type Errores = {
  foto: string | null;
  categoria: string | null;
  severidad: string | null;
  descripcion: string | null;
  ubicacion: string | null;
};

const ERRORES_VACIOS: Errores = {
  foto: null,
  categoria: null,
  severidad: null,
  descripcion: null,
  ubicacion: null,
};

// Nombre del campo en la API → nombre del campo en el formulario.
const CAMPOS_API: Record<string, keyof Errores> = {
  foto: 'foto',
  categoriaId: 'categoria',
  severidadDeclarada: 'severidad',
  descripcion: 'descripcion',
  lat: 'ubicacion',
  lon: 'ubicacion',
};

const SEVERIDADES: { valor: Severidad; etiqueta: string }[] = [
  { valor: 'LEVE', etiqueta: 'Leve' },
  { valor: 'MODERADA', etiqueta: 'Moderada' },
  { valor: 'GRAVE', etiqueta: 'Grave' },
];

export function PaginaReportar() {
  const categorias = useCategorias();
  const reportar = useReportar();

  const [foto, setFoto] = useState<File | null>(null);
  const [categoriaId, setCategoriaId] = useState('');
  const [severidad, setSeveridad] = useState<Severidad | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [punto, setPunto] = useState<Punto | null>(null);
  const [errores, setErrores] = useState<Errores>(ERRORES_VACIOS);
  const [aviso, setAviso] = useState(false);

  // La vista previa es una URL temporal: hay que liberarla al cambiar la foto.
  const vistaPrevia = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  function marcar(campo: keyof Errores, error: string | null) {
    setErrores((previos) => ({ ...previos, [campo]: error }));
  }

  function reiniciar() {
    setFoto(null);
    setCategoriaId('');
    setSeveridad('');
    setDescripcion('');
    setPunto(null);
    setErrores(ERRORES_VACIOS);
    setAviso(false);
    reportar.reset();
  }

  function alElegirFoto(evento: ChangeEvent<HTMLInputElement>) {
    setFoto(evento.target.files?.[0] ?? null);
    marcar('foto', null);
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados: Errores = {
      foto: foto ? null : 'Sacá una foto o elegí una de la galería',
      categoria: categoriaId ? null : 'Falta la categoría',
      severidad: severidad ? null : 'Falta la gravedad',
      descripcion: null,
      ubicacion: punto ? null : 'Marcá el punto en el mapa',
    };
    setErrores(validados);
    setAviso(false);
    // Sin foto ni punto no se envía (criterio 1 del issue).
    if (!foto || !categoriaId || !severidad || !punto) return;

    reportar.mutate(
      {
        foto,
        categoriaId: Number(categoriaId),
        severidad,
        descripcion,
        lat: punto.lat,
        lon: punto.lon,
      },
      {
        // No se toca nada de lo cargado: solo se muestran los errores del servidor.
        onError: (error) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(error), CAMPOS_API);
          setErrores({ ...ERRORES_VACIOS, ...porCampo });
          setAviso(sinCampo);
        },
      },
    );
  }

  if (reportar.isSuccess) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Reporte enviado</h1>
        <p className="text-texto-secundario">
          Ya está en el mapa como «En revisión», hasta que se verifique.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/mapa"
            className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
          >
            Ver en el mapa
          </Link>
          <button
            type="button"
            onClick={reiniciar}
            className="rounded-md border border-borde bg-superficie px-4 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna"
          >
            Cargar otro reporte
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Reportar un problema</h1>
        <p className="text-texto-secundario">
          Cargá una foto, elegí el tipo y la gravedad, y marcá el punto en el mapa.
        </p>
      </div>

      <form onSubmit={(evento) => enviar(evento)} className="space-y-4" noValidate>
        <div className="space-y-1">
          <Campo
            id="foto"
            etiqueta="Foto"
            type="file"
            accept="image/jpeg,image/png"
            onChange={alElegirFoto}
            error={errores.foto}
          />
          {vistaPrevia && (
            <img
              src={vistaPrevia}
              alt="Vista previa de la foto del problema"
              className="mt-2 max-h-64 rounded-md border border-borde"
            />
          )}
        </div>

        <CampoSelecto
          id="categoria"
          etiqueta="Categoría"
          value={categoriaId}
          onChange={(evento) => {
            setCategoriaId(evento.target.value);
            marcar('categoria', null);
          }}
          error={errores.categoria}
          disabled={categorias.isPending}
        >
          {categorias.isPending ? (
            <option value="">Cargando categorías…</option>
          ) : (
            <>
              <option value="">Elegí una categoría</option>
              {(categorias.data ?? []).map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </>
          )}
        </CampoSelecto>

        <CampoSelecto
          id="severidad"
          etiqueta="Gravedad"
          value={severidad}
          onChange={(evento) => {
            setSeveridad(evento.target.value as Severidad | '');
            marcar('severidad', null);
          }}
          error={errores.severidad}
        >
          <option value="">Elegí la gravedad</option>
          {SEVERIDADES.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </CampoSelecto>

        <div className="space-y-1">
          <label htmlFor="descripcion" className="block text-sm font-semibold text-texto">
            Descripción (opcional)
          </label>
          <textarea
            id="descripcion"
            rows={3}
            maxLength={1000}
            value={descripcion}
            placeholder="Por ejemplo: pozo grande frente a la escuela"
            onChange={(evento) => {
              setDescripcion(evento.target.value);
              marcar('descripcion', null);
            }}
            className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-texto placeholder:text-texto-secundario focus:border-primario focus:outline-none"
          />
          {errores.descripcion && <p className="text-sm text-peligro">{errores.descripcion}</p>}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-texto">Ubicación</p>
          <p className="text-sm text-texto-secundario">
            {punto
              ? `Elegiste ${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}. Tocá el mapa para moverlo.`
              : 'Tocá el mapa para marcar dónde está el problema.'}
          </p>
          <div className="mt-1 h-72 overflow-hidden rounded-lg border border-borde">
            <MapaElegirPunto
              punto={punto}
              alElegirPunto={(lat, lon) => {
                setPunto({ lat, lon });
                marcar('ubicacion', null);
              }}
            />
          </div>
          {errores.ubicacion && <p className="text-sm text-peligro">{errores.ubicacion}</p>}
        </div>

        {categorias.isError && (
          <AvisoError
            error={aErrorApi(categorias.error)}
            alReintentar={() => void categorias.refetch()}
            reintentando={categorias.isFetching}
          />
        )}

        {reportar.isError && aviso && <AvisoError error={aErrorApi(reportar.error)} />}

        <button
          type="submit"
          disabled={reportar.isPending}
          className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90 disabled:opacity-50"
        >
          {reportar.isPending ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </form>
    </section>
  );
}
