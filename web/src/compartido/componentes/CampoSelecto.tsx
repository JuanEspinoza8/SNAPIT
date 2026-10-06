import type { SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  etiqueta: string;
  error?: string | null;
}

export function CampoSelecto({ id, etiqueta, error, ...select }: Props) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <select
        id={id}
        {...select}
        className={`w-full rounded-md border bg-superficie px-3 py-2 text-texto focus:outline-none ${
          error ? 'border-peligro' : 'border-borde focus:border-primario'
        }`}
      />
      {error && <p className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
