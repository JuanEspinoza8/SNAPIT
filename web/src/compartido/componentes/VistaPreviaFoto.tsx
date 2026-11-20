import { useState } from 'react';

/**
 * La vista previa de la foto elegida. Una foto HEIC (la del iPhone) casi ningún navegador la puede mostrar,
 * salvo Safari: en ese caso se avisa que se manda igual, porque el servidor la convierte.
 */
export function VistaPreviaFoto({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Se recuerda cuál falló, no si falló: con otra foto vuelve a intentar sin un efecto que lo reinicie.
  const [fallo, setFallo] = useState<string | null>(null);
  if (fallo === src) {
    return (
      <p className="mt-2 rounded-md border border-borde bg-superficie-alterna px-3 py-2 text-sm text-texto-secundario">
        Este navegador no puede mostrar la foto (por ejemplo, una HEIC de iPhone), pero se envía igual: la
        convertimos al recibirla.
      </p>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFallo(src)} />;
}
