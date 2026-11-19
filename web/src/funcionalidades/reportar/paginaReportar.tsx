import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategorias } from '../../compartido/catalogo/categorias.js';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { conAviso } from '../../compartido/componentes/AvisoFlotante.js';
import { Campo } from '../../compartido/componentes/Campo.js';
import { CampoSelecto } from '../../compartido/componentes/CampoSelecto.js';
import { VistaPreviaFoto } from '../../compartido/componentes/VistaPreviaFoto.js';
import { problemaConLaFoto, TIPOS_FOTO } from '../../compartido/foto.js';
import { aErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { ubicacionDeLaFoto } from '../../compartido/ubicacionFoto.js';
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

const SEVERIDADES: { valor: Severidad; etiqueta: string }[] = [
  { valor: 'LEVE', etiqueta: 'Leve' },
  { valor: 'MODERADA', etiqueta: 'Moderada' },
  { valor: 'GRAVE', etiqueta: 'Grave' },
];

export function PaginaReportar() {
  const navegar = useNavigate();
  const categorias = useCategorias();
  const reportar = useReportar();
  const ia = useSugerenciaIa();
  const sugerencia = ia.estado.tipo === 'lista' ? ia.estado.sugerencia : null;
  // Lo que sugirió la IA, solo si es una categoría de la lista y una gravedad conocida: lo demás se ignora.
  const categoriaSugerida = categorias.data?.find((categoria) => categoria.id === sugerencia?.categoriaId);
  const gravedadSugerida = SEVERIDADES.find((opcion) => opcion.valor === sugerencia?.severidad);

  const [foto, setFoto] = useState<File | null>(null);
  const [categoriaId, setCategoriaId] = useState('');
  const [severidad, setSeveridad] = useState<Severidad | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [punto, setPunto] = useState<Punto | null>(null);
  // De dónde salió el punto: de la ubicación que trae la foto o del mapa. Uno marcado a mano no se pisa.
  const [origenPunto, setOrigenPunto] = useState<'foto' | 'mano' | null>(null);
  const origen = useRef(origenPunto);
  // La ubicación que trae la foto actual, para ofrecerla si el vecino ya marcó otro punto.
  const [ubicacionFoto, setUbicacionFoto] = useState<Punto | null>(null);
  const fotoActual = useRef<File | null>(null);
  const [errores, setErrores] = useState<Errores>(ERRORES_VACIOS);
  const [aviso, setAviso] = useState(false);
  // Si la IA completó algún campo: el aviso «completó lo que no habías elegido» sale solo en ese caso.
  const [iaCompleto, setIaCompleto] = useState(false);

  // La respuesta de la IA llega después: para no pisar al vecino hay que ver lo que eligió en ese momento.
  const eleccion = useRef({ categoriaId, severidad });
  useEffect(() => {
    eleccion.current = { categoriaId, severidad };
  }, [categoriaId, severidad]);
  // Los campos que completó la IA y el vecino no tocó: con otra foto se vacían (decisión del 22/10, igual que
  // la app).
  const completadoPorIa = useRef({ categoria: false, severidad: false });

  // La vista previa es una URL temporal: hay que liberarla al cambiar la foto.
  const vistaPrevia = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  function marcar(campo: keyof Errores, error: string | null) {
    setErrores((previos) => ({ ...previos, [campo]: error }));
  }

  function ponerPunto(nuevo: Punto | null, de: 'foto' | 'mano' | null) {
    setPunto(nuevo);
    setOrigenPunto(de);
    origen.current = de;
    if (nuevo) marcar('ubicacion', null);
  }

  /**
   * Lee dónde se sacó la foto (EXIF) y, si lo trae, marca ahí el punto: es donde el vecino vio el problema, aunque
   * reporte desde otro lado. Un punto que el vecino marcó a mano no se toca; uno que venía de la foto anterior,
   * sí, porque ya no corresponde.
   */
  function ubicarPorLaFoto(archivo: File) {
    fotoActual.current = archivo;
    setUbicacionFoto(null);
    void ubicacionDeLaFoto(archivo).then((ubicacion) => {
      if (fotoActual.current !== archivo) return;
      setUbicacionFoto(ubicacion);
      if (origen.current === 'mano') return;
      if (ubicacion) ponerPunto(ubicacion, 'foto');
      else if (origen.current === 'foto') ponerPunto(null, null);
    });
  }

  /** Descarta la sugerencia de la foto anterior y vacía lo que había completado ella. */
  function olvidarSugerencia() {
    if (completadoPorIa.current.categoria) setCategoriaId('');
    if (completadoPorIa.current.severidad) setSeveridad('');
    completadoPorIa.current = { categoria: false, severidad: false };
    setIaCompleto(false);
    ia.reiniciar();
  }

  function alElegirFoto(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0] ?? null;
    const problema = archivo ? problemaConLaFoto(archivo) : null;
    olvidarSugerencia();
    if (problema) {
      evento.target.value = '';
      setFoto(null);
      marcar('foto', problema);
      return;
    }
    setFoto(archivo);
    marcar('foto', null);
    if (archivo) ubicarPorLaFoto(archivo);
    // La IA completa solo lo que el vecino todavía no eligió: él siempre tiene la última palabra (F06).
    void ia.pedir(archivo).then((propuesta) => {
      if (!propuesta) return;
      const actual = eleccion.current;
      // Una categoría que no está en la lista quedaría elegida sin verse, y una gravedad desconocida, también.
      const enLista = categorias.data?.some((categoria) => categoria.id === propuesta.categoriaId) ?? false;
      const conocida = SEVERIDADES.some((opcion) => opcion.valor === propuesta.severidad);
      if (!actual.categoriaId && enLista) {
        setCategoriaId(String(propuesta.categoriaId));
        completadoPorIa.current.categoria = true;
        marcar('categoria', null);
      }
      if (!actual.severidad && conocida) {
        setSeveridad(propuesta.severidad);
        completadoPorIa.current.severidad = true;
        marcar('severidad', null);
      }
      setIaCompleto(completadoPorIa.current.categoria || completadoPorIa.current.severidad);
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
    // Si la IA todavía analiza, el pedido se corta y el reporte sale sin sugerencia: no se espera.
    if (ia.estado.tipo === 'analizando') ia.reiniciar();

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
        // Vuelve al inicio con un aviso arriba: el reporte queda pendiente hasta que se revise.
        onSuccess: (enviado) =>
          void navegar('/', {
            state: conAviso({
              titulo: 'Reporte enviado',
              texto:
                enviado.estadoVerificacion === 'VERIFICADO'
                  ? 'Se verificó y ya está publicado.'
                  : 'Queda pendiente de aprobación antes de publicarse.',
            }),
          }),
        // No se toca nada de lo cargado: solo se muestran los errores del servidor.
        onError: (error) => {
          const { porCampo, sinCampo } = repartirErrores(aErrorApi(error), CAMPOS_API);
          setErrores({ ...ERRORES_VACIOS, ...porCampo });
          setAviso(sinCampo);
        },
      },
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Reportar un problema</h1>
        <p className="text-texto-secundario">
          Cargá una foto, elegí el tipo y la gravedad, y marcá el punto en el mapa. Si la foto trae su
          ubicación, el punto se marca solo.
        </p>
      </div>

      <form onSubmit={(evento) => enviar(evento)} className="space-y-4" noValidate>
        <div className="space-y-1">
          <Campo
            id="foto"
            etiqueta="Foto"
            type="file"
            accept={TIPOS_FOTO.join(',')}
            onChange={alElegirFoto}
            error={errores.foto}
          />
          {vistaPrevia && (
            <VistaPreviaFoto
              src={vistaPrevia}
              alt="Vista previa de la foto del problema"
              className="mt-2 max-h-64 rounded-md border border-borde"
            />
          )}
          <AvisoIa estado={ia.estado.tipo} completo={iaCompleto} />
        </div>

        <div className="space-y-1">
          <CampoSelecto
            id="categoria"
            etiqueta="Categoría"
            value={categoriaId}
            onChange={(evento) => {
              setCategoriaId(evento.target.value);
              completadoPorIa.current.categoria = false;
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
          {categoriaSugerida && categoriaId && (
            <MarcaIa
              aceptada={categoriaId === String(categoriaSugerida.id)}
              propuesta={categoriaSugerida.nombre}
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
            completadoPorIa.current.severidad = false;
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
        {gravedadSugerida && severidad && (
          <MarcaIa aceptada={severidad === gravedadSugerida.valor} propuesta={gravedadSugerida.etiqueta} />
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
            aria-describedby="aviso-publicacion"
            onChange={(evento) => {
              setDescripcion(evento.target.value);
              marcar('descripcion', null);
            }}
            className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-texto placeholder:text-texto-secundario focus:border-primario focus:outline-none"
          />
          {/* El inicio publica la foto y la descripción, sin el nombre. Mismo texto que en la app. */}
          <p id="aviso-publicacion" className="text-sm text-texto-secundario">
            La foto y la descripción se ven en el inicio, sin tu nombre.
          </p>
          {errores.descripcion && <p className="text-sm text-peligro">{errores.descripcion}</p>}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-texto">Ubicación</p>
          <p className="text-sm text-texto-secundario" role="status">
            {origenPunto === 'foto'
              ? 'Lo marcamos donde se sacó la foto. Si no es ahí, tocá el mapa para moverlo.'
              : punto
                ? `Elegiste ${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}. Tocá el mapa para moverlo.`
                : foto
                  ? 'La foto no trae su ubicación: tocá el mapa para marcar dónde está el problema.'
                  : 'Tocá el mapa para marcar dónde está el problema.'}
          </p>
          {origenPunto === 'mano' && ubicacionFoto && (
            <button
              type="button"
              onClick={() => ponerPunto(ubicacionFoto, 'foto')}
              className="text-sm font-semibold text-primario hover:opacity-80"
            >
              Usar donde se sacó la foto
            </button>
          )}
          <div className="mt-1 h-72 overflow-hidden rounded-lg border border-borde">
            <MapaElegirPunto
              punto={punto}
              centrar={origenPunto === 'foto'}
              alElegirPunto={(lat, lon) => ponerPunto({ lat, lon }, 'mano')}
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

function AvisoIa({
  estado,
  completo,
}: {
  estado: 'sinFoto' | 'analizando' | 'lista' | 'noDisponible';
  /** Si la IA completó algún campo. Si no completó nada, las marcas de cada campo alcanzan. */
  completo: boolean;
}) {
  if (estado === 'sinFoto' || (estado === 'lista' && !completo)) return null;
  const textos = {
    analizando: 'Analizando la foto con IA…',
    lista: 'La IA analizó la foto y completó lo que no habías elegido. Revisalo: podés cambiarlo.',
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

/**
 * Debajo de cada campo elegido: si quedó lo que propuso la IA o si el vecino eligió otra cosa (antes o después).
 * Con el campo vacío no se muestra: el vecino todavía no eligió nada.
 */
function MarcaIa({ aceptada, propuesta }: { aceptada: boolean; propuesta: string }) {
  return aceptada ? (
    <p className="text-xs font-semibold text-primario">Sugerido por la IA</p>
  ) : (
    <p className="text-xs text-texto-secundario">Elegiste otra: la IA sugería «{propuesta}»</p>
  );
}
