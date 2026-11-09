import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { FotoConSesion } from '../../compartido/componentes/FotoConSesion.js';
import { Modal } from '../../compartido/componentes/Modal.js';
import { BotonEnviar, CampoTexto, Confirmacion, ErrorDelServidor } from './AccionesFicha.js';
import { fechaHora } from './formato.js';
import type { FichaGestion, ResultadoCierre } from './tipos.js';
import type { useAccionesFicha } from './useGestion.js';

type Acciones = ReturnType<typeof useAccionesFicha>;

// Las que acepta el servidor (POST /api/incidentes/:id/cierre).
const TIPOS_FOTO = ['image/jpeg', 'image/png'];

const RESULTADOS: Record<ResultadoCierre, { etiqueta: string; clase: string }> = {
  VALIDADO: { etiqueta: 'Validado', clase: 'border-primario text-primario' },
  OBSERVADO: { etiqueta: 'Por confirmar', clase: 'border-texto-secundario text-texto' },
  RECHAZADO: { etiqueta: 'Rechazado', clase: 'border-peligro text-peligro' },
};

function EtiquetaResultado({ resultado }: { resultado: ResultadoCierre }) {
  const { etiqueta, clase } = RESULTADOS[resultado];
  return <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${clase}`}>{etiqueta}</span>;
}

function Foto({ id, alt }: { id: number; alt: string }) {
  return (
    <FotoConSesion
      fotoId={id}
      className="aspect-[4/3] w-full rounded object-cover"
      siFalla={
        <span
          role="img"
          aria-label={alt}
          className="flex aspect-[4/3] w-full items-center justify-center rounded bg-borde text-xs text-texto-secundario"
        >
          Foto no disponible
        </span>
      }
    />
  );
}

/**
 * El cierre del incidente (F09): cómo quedó el último intento, por qué, y el antes y el después lado a lado.
 * Si está observado y quien mira puede confirmarlo, ofrece aceptarlo o rechazarlo.
 */
export function SeccionCierre({
  ficha,
  puedeConfirmar,
  alAceptar,
  alRechazar,
}: {
  ficha: FichaGestion;
  puedeConfirmar: boolean;
  alAceptar: () => void;
  alRechazar: () => void;
}) {
  const cierre = ficha.cierre;
  if (!cierre) return null;
  // El antes: la primera foto de cada reporte que cuenta (no desestimado), como las que comparó la IA.
  const antes = ficha.reportes
    .filter((reporte) => reporte.estadoVerificacion !== 'DESESTIMADO')
    .flatMap((reporte) => reporte.fotos.slice(0, 1))
    .slice(0, 2);
  const despues = cierre.fotos.at(-1);
  const anteriores = cierre.fotos.slice(0, -1);

  return (
    <section
      aria-labelledby="titulo-cierre"
      className="flex flex-col gap-3 rounded-lg border border-borde p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-cierre" className="font-semibold text-texto">
          Cierre
        </h2>
        {cierre.resultadoComparacion && <EtiquetaResultado resultado={cierre.resultadoComparacion} />}
      </div>
      {cierre.detalleComparacion && <p className="text-sm text-texto">{cierre.detalleComparacion}</p>}
      <p className="text-xs text-texto-secundario">
        {cierre.usuario.nombre}, {fechaHora(cierre.creadoEn)} ·{' '}
        {cierre.distanciaMetros === null
          ? 'La foto no trae ubicación'
          : `A ${Math.round(cierre.distanciaMetros)} m del incidente`}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs font-semibold text-texto-secundario">Antes</figcaption>
          {antes.length > 0 ? (
            antes.map((foto) => <Foto key={foto.id} id={foto.id} alt="Foto del antes" />)
          ) : (
            <p className="text-xs text-texto-secundario">Sin fotos del antes</p>
          )}
        </figure>
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs font-semibold text-texto-secundario">Después</figcaption>
          {despues && <Foto id={despues.id} alt="Foto del después" />}
        </figure>
      </div>
      {anteriores.length > 0 && (
        <p className="text-xs text-texto-secundario">
          {anteriores.length === 1
            ? 'Hubo un intento anterior; su foto se conserva.'
            : `Hubo ${anteriores.length} intentos anteriores; sus fotos se conservan.`}
        </p>
      )}

      {cierre.resultadoComparacion === 'OBSERVADO' &&
        ficha.estado === 'EN_EJECUCION' &&
        (puedeConfirmar ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={alAceptar}
              className="rounded-md bg-primario px-3 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
            >
              Confirmar el cierre…
            </button>
            <button
              type="button"
              onClick={alRechazar}
              className="rounded-md border border-peligro px-3 py-2 text-sm font-semibold text-peligro hover:bg-superficie-alterna"
            >
              Rechazar el cierre…
            </button>
          </div>
        ) : (
          <p role="status" className="rounded-md bg-superficie-alterna px-3 py-2 text-sm text-texto">
            Espera que otro operador del organismo lo confirme o lo rechace.
          </p>
        ))}
    </section>
  );
}

const TITULOS: Record<ResultadoCierre, string> = {
  VALIDADO: 'Incidente resuelto',
  RECHAZADO: 'El cierre no se aceptó',
  OBSERVADO: 'Queda por confirmar',
};

/**
 * Subir la foto del después y ver el resultado con su explicación. Si se rechaza, deja probar con otra foto
 * (el servidor corrige el mismo cierre).
 */
export function DialogoCierre({
  ficha,
  mutacion,
  alCerrar,
}: {
  ficha: FichaGestion;
  mutacion: Acciones['cerrar'];
  alCerrar: () => void;
}) {
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vistaPrevia = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => {
    if (!vistaPrevia) return;
    return () => URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  const alElegir = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0] ?? null;
    if (archivo && !TIPOS_FOTO.includes(archivo.type)) {
      evento.target.value = '';
      setFoto(null);
      setError('Tiene que ser una foto JPG o PNG');
      return;
    }
    setFoto(archivo);
    setError(null);
  };

  const resultado = mutacion.data?.cierre;
  return (
    <Modal titulo={`Cerrar el incidente #${ficha.id}`} ancho="max-w-md" alCerrar={alCerrar}>
      {resultado ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-texto">{TITULOS[resultado.resultadoComparacion]}</h3>
            <EtiquetaResultado resultado={resultado.resultadoComparacion} />
          </div>
          <p className="text-sm text-texto">{resultado.detalleComparacion}</p>
          <div className="flex justify-end gap-2">
            {resultado.resultadoComparacion === 'RECHAZADO' && (
              <button
                type="button"
                onClick={() => {
                  mutacion.reset();
                  setFoto(null);
                }}
                className="rounded-md border border-borde px-4 py-2 text-sm font-semibold text-primario hover:bg-superficie-alterna"
              >
                Probar con otra foto
              </button>
            )}
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-secundario">
            Subí una foto de cómo quedó, sacada en el mismo lugar con la ubicación del celular activada. El
            sistema controla que sea del lugar y la compara con las del antes. Sin ubicación, el cierre queda
            para que lo confirme otro operador.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="cierre-foto" className="text-sm font-semibold text-texto">
              Foto del después
            </label>
            <input
              id="cierre-foto"
              type="file"
              accept={TIPOS_FOTO.join(',')}
              disabled={mutacion.isPending}
              onChange={alElegir}
              className="text-sm text-texto"
            />
            {error && <p className="text-sm text-peligro">{error}</p>}
          </div>
          {vistaPrevia && (
            <img
              src={vistaPrevia}
              alt="Vista previa de la foto del después"
              className="max-h-56 rounded-md border border-borde object-contain"
            />
          )}
          {mutacion.isPending && (
            <p role="status" className="text-sm text-texto-secundario">
              Comparando con las fotos del antes: puede tardar unos segundos.
            </p>
          )}
          <ErrorDelServidor error={mutacion.error} />
          <BotonEnviar
            texto="Enviar la foto"
            enviando={mutacion.isPending}
            alEnviar={() => {
              if (!foto) {
                setError('Elegí la foto del después');
                return;
              }
              mutacion.mutate(foto);
            }}
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * Aceptar o rechazar un cierre observado. Aceptar resuelve el incidente y no se puede deshacer: pide una
 * confirmación. Rechazar pide el motivo, para que quien cerró sepa qué corregir.
 */
export function DialogoConfirmarCierre({
  ficha,
  aceptar,
  mutacion,
  alTerminar,
  alCerrar,
}: {
  ficha: FichaGestion;
  aceptar: boolean;
  mutacion: Acciones['confirmarCierre'];
  alTerminar: () => void;
  alCerrar: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const validar = () => {
    const mensaje = !aceptar && !comentario.trim() ? 'Escribí el motivo' : null;
    setError(mensaje);
    return mensaje === null;
  };
  const enviar = () => mutacion.mutate({ aceptar, comentario }, { onSuccess: alTerminar });

  return (
    <Modal
      titulo={aceptar ? `Confirmar el cierre del #${ficha.id}` : `Rechazar el cierre del #${ficha.id}`}
      ancho="max-w-md"
      alCerrar={alCerrar}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-secundario">
          {aceptar
            ? 'El incidente queda resuelto y la foto del después se publica en su ficha.'
            : 'El incidente sigue en ejecución y se puede volver a cerrar con otra foto.'}
        </p>
        <CampoTexto
          id="cierre-comentario"
          etiqueta={aceptar ? 'Comentario (opcional)' : 'Motivo'}
          valor={comentario}
          error={error}
          deshabilitado={confirmando}
          alCambiar={(texto) => {
            setComentario(texto);
            setError(null);
          }}
          alSalir={aceptar ? undefined : validar}
        />
        <ErrorDelServidor error={mutacion.error} />
        {confirmando ? (
          <Confirmacion
            pregunta="¿Dar el incidente por resuelto? Es definitivo."
            texto="Sí, resolver"
            enviando={mutacion.isPending}
            alConfirmar={enviar}
            alCancelar={() => setConfirmando(false)}
          />
        ) : (
          <BotonEnviar
            texto={aceptar ? 'Confirmar el cierre' : 'Rechazar el cierre'}
            enviando={mutacion.isPending}
            alEnviar={() => {
              if (!validar()) return;
              if (aceptar) setConfirmando(true);
              else enviar();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
