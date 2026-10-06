import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  etiqueta: string;
  error?: string | null;
}

export function Campo({ id, etiqueta, error, type = 'text', ...input }: Props) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <input
        id={id}
        type={type}
        {...input}
        className={`w-full rounded-md border bg-superficie px-3 py-2 text-texto placeholder:text-texto-secundario focus:outline-none ${
          error ? 'border-peligro' : 'border-borde focus:border-primario'
        }`}
      />
      {error && <p className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
