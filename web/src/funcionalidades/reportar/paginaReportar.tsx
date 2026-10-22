import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import type { EstadoNavegacionMapa } from '../mapa/tipos.js';
import { MapaElegirPunto, type Punto } from './MapaElegirPunto.js';
import type { Severidad } from './tipos.js';
import { useReportar } from './useReportar.js';
import { useSugerenciaIa } from './useSugerenciaIa.js';

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

// Las que acepta el servidor. Cualquier otra la rechazaría recién al enviar.
const TIPOS_FOTO = ['image/jpeg', 'image/png'];

// El tope de nginx en la demo (client_max_body_size de nginx.conf): más pesada, ni llega al servidor.
// El límite del servidor (FOTO_MAX_MB) es menor y lo avisa él, debajo de la foto.
const PESO_MAXIMO_MB = 20;

const SEVERIDADES: { valor: Severidad; etiqueta: string }[] = [
  { valor: 'LEVE', etiqueta: 'Leve' },
  { valor: 'MODERADA', etiqueta: 'Moderada' },
  { valor: 'GRAVE', etiqueta: 'Grave' },
];

export function PaginaReportar() {
  const categorias = useCategorias();
  const reportar = useReportar();
  const ia = useSugerenciaIa();
  const sugerencia = ia.estado.tipo === 'lista' ? ia.estado.sugerencia : null;

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
    ia.reiniciar();
    reportar.reset();
  }

  function alElegirFoto(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0] ?? null;
    const problema = !archivo
      ? null
      : !TIPOS_FOTO.includes(archivo.type)
        ? 'Tiene que ser una foto JPG o PNG'
        : archivo.size > PESO_MAXIMO_MB * 1024 * 1024
          ? `Pesa demasiado: elegí una foto de hasta ${PESO_MAXIMO_MB} MB`
          : null;
    if (problema) {
      evento.target.value = '';
      setFoto(null);
      marcar('foto', problema);
      ia.reiniciar();
      return;
    }
    setFoto(archivo);
    marcar('foto', null);
    // La IA completa la categoría y la gravedad; el vecino siempre puede cambiarlas antes de enviar.
    void ia.pedir(archivo).then((propuesta) => {
      if (!propuesta) return;
      setCategoriaId(String(propuesta.categoriaId));
      setSeveridad(propuesta.severidad);
      marcar('categoria', null);
      marcar('severidad', null);
    });
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validados: Errores = {
      foto: foto ? null : 'Elegí una foto del problema',
      categoria: categoriaId ? null : 'Falta la categoría',
      severidad: severidad ? null : 'Falta la gravedad',
      descripcion: null,
      ubicacion: punto ? null : 'Marcá el punto en el mapa',
    };
    setErrores(validados);
    setAviso(false);
    if (!foto || !categoriaId || !severidad || !punto) return;

    reportar.mutate(
      {
        foto,
        categoriaId: Number(categoriaId),
        severidad,
        descripcion,
        lat: punto.lat,
        lon: punto.lon,
        sugerencia,
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
    // Desde la verificación automática (#50) un reporte puede quedar verificado al llegar.
    const verificado = reportar.data.estadoVerificacion === 'VERIFICADO';
    const foco: EstadoNavegacionMapa | undefined = punto ? { foco: punto } : undefined;
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-texto">Reporte enviado</h1>
        <p className="text-texto-secundario">
          {verificado
            ? 'Se verificó y ya está en el mapa.'
            : 'Ya está en el mapa y queda pendiente de revisión hasta que se verifique.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/mapa"
            state={foco}
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
          <AvisoIa estado={ia.estado.tipo} />
        </div>

        <div className="space-y-1">
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
          {sugerencia && (
            <MarcaIa
              aceptada={categoriaId === String(sugerencia.categoriaId)}
              propuesta={
                categorias.data?.find((categoria) => categoria.id === sugerencia.categoriaId)?.nombre ??
                `categoría ${sugerencia.categoriaId}`
              }
            />
          )}
          {categorias.isSuccess && categorias.data.length === 0 && (
            <p className="text-sm text-texto-secundario">
              Todavía no hay categorías cargadas, así que no se puede reportar. Probá más tarde.
            </p>
          )}
        </div>

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
        {sugerencia && (
          <MarcaIa
            aceptada={severidad === sugerencia.severidad}
            propuesta={SEVERIDADES.find((opcion) => opcion.valor === sugerencia.severidad)!.etiqueta}
          />
        )}

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

function AvisoIa({ estado }: { estado: 'sinFoto' | 'analizando' | 'lista' | 'noDisponible' }) {
  if (estado === 'sinFoto') return null;
  const textos = {
    analizando: 'Analizando la foto con IA…',
    lista: 'La IA completó la categoría y la gravedad según la foto. Revisalas: podés cambiarlas.',
    noDisponible: 'La IA no está disponible en este momento: elegí la categoría y la gravedad a mano.',
  };
  return (
    <p
      role="status"
      className={`mt-2 rounded-md border px-3 py-2 text-sm ${
        estado === 'noDisponible'
          ? 'border-borde bg-superficie-alterna text-texto-secundario'
          : 'border-primario bg-superficie-alterna text-primario'
      }`}
    >
      {estado === 'analizando' && (
        <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-primario border-t-transparent align-middle" />
      )}
      {textos[estado]}
    </p>
  );
}

/** Debajo de cada campo: si quedó lo que propuso la IA o si el vecino lo cambió. */
function MarcaIa({ aceptada, propuesta }: { aceptada: boolean; propuesta: string }) {
  return aceptada ? (
    <p className="text-xs font-semibold text-primario">✦ Sugerido por IA</p>
  ) : (
    <p className="text-xs text-texto-secundario">Lo cambiaste: la IA había sugerido «{propuesta}»</p>
  );
}
