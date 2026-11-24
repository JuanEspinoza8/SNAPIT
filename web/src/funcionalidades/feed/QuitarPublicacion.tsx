import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AvisoError } from '../../compartido/componentes/AvisoError.js';
import { Modal } from '../../compartido/componentes/Modal.js';
import { useCliente } from '../../compartido/red/clienteContexto.js';
import { aErrorApi, type ErrorApi } from '../../compartido/red/error.js';
import { repartirErrores } from '../../compartido/red/erroresPorCampo.js';
import { useSesion } from '../../compartido/sesion/sesionContexto.js';
import { esAdministrador } from '../../compartido/sesion/usuario.js';

const LARGO_MAXIMO = 500;

/**
 * Moderación (solo el administrador): quitar una publicación, por ejemplo una foto con datos personales que la IA
 * dejó pasar. Pide un motivo, que queda en la bitácora del incidente y que ve quien abra después el link.
 */
export function QuitarPublicacion({ reporteId }: { reporteId: number }) {
  const { usuario } = useSesion();
  const [abierta, setAbierta] = useState(false);
  if (!usuario || !esAdministrador(usuario)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="rounded-md border border-peligro px-3 py-1.5 text-sm font-semibold text-peligro hover:bg-superficie"
      >
        Quitar publicación
      </button>
      {abierta && <VentanaQuitar reporteId={reporteId} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

function VentanaQuitar({ reporteId, alCerrar }: { reporteId: number; alCerrar: () => void }) {
  const cliente = useCliente();
  const consulta = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const quitar = useMutation<void, ErrorApi, string>({
    mutationFn: (texto) =>
      cliente
        .pedir<void>(`/reportes/${reporteId}`, { metodo: 'DELETE', cuerpo: { motivo: texto } })
        .catch((causa: unknown) => Promise.reject(aErrorApi(causa))),
    onSuccess: async () => {
      // La publicación pasa a decir que se quitó; el feed y la ficha dejan de mostrarla.
      await Promise.all([
        consulta.invalidateQueries({ queryKey: ['reporte', reporteId] }),
        consulta.invalidateQueries({ queryKey: ['feed'] }),
        consulta.invalidateQueries({ queryKey: ['incidente'] }),
      ]);
      alCerrar();
    },
  });
  const delServidor = quitar.error ? repartirErrores(quitar.error, { motivo: 'motivo' as const }) : null;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const texto = motivo.trim();
    if (!texto) return setError('Contá por qué se quita');
    setError(null);
    quitar.mutate(texto);
  }

  const errorMotivo = error ?? delServidor?.porCampo.motivo;
  return (
    <Modal titulo="Quitar publicación" ancho="max-w-lg" alCerrar={alCerrar}>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-texto-secundario">
          Deja de verse en el feed y en la ficha del problema, y cuenta como eliminada. Quien abra el link va
          a ver que la quitó un administrador, con este motivo. La reputación del vecino no cambia.
        </p>
        <div className="space-y-1">
          <label htmlFor="motivo-quitar" className="block text-sm font-semibold text-texto">
            Motivo
          </label>
          <textarea
            id="motivo-quitar"
            rows={3}
            maxLength={LARGO_MAXIMO}
            value={motivo}
            placeholder="Ej.: se ve una patente en la foto"
            onChange={(evento) => {
              setMotivo(evento.target.value);
              quitar.reset();
            }}
            className={`w-full resize-y rounded-md border bg-superficie px-3 py-2 text-sm text-texto placeholder:text-texto-secundario focus:outline-none ${
              errorMotivo ? 'border-peligro' : 'border-borde focus:border-primario'
            }`}
          />
          {errorMotivo && <p className="text-sm text-peligro">{errorMotivo}</p>}
        </div>
        {quitar.error && (!delServidor || delServidor.sinCampo) && <AvisoError error={quitar.error} />}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-md px-4 py-2 text-sm font-semibold text-texto-secundario hover:bg-superficie-alterna"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={quitar.isPending}
            className="rounded-md bg-peligro px-4 py-2 text-sm font-semibold text-sobre-peligro hover:opacity-90 disabled:opacity-60"
          >
            {quitar.isPending ? 'Quitando…' : 'Quitar publicación'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
