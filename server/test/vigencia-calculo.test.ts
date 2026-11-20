import type { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/config/logger.js';
import { vigenciaRenovada, vigenciaSegunCategoria } from '../src/modulos/incidentes/calculo.js';
import { vigenciaAlConfirmar, vigenciaDeCategoria } from '../src/modulos/incidentes/vigencia.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const desde = new Date('2026-11-10T12:00:00Z');
const dentroDe = (dias: number) => new Date(desde.getTime() + dias * DIA_MS);

describe('vigenciaSegunCategoria', () => {
  it('una permanente no vence, aunque la categoría tenga días cargados', () => {
    expect(
      vigenciaSegunCategoria({ tipoVigenciaDefault: 'PERMANENTE', diasCaducidadDefault: 7 }, desde, 30),
    ).toEqual({ tipoVigencia: 'PERMANENTE', vigenteHasta: null });
  });

  it('una temporal vence a los días de su categoría, contados desde `desde`', () => {
    expect(
      vigenciaSegunCategoria({ tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: 7 }, desde, 30),
    ).toEqual({ tipoVigencia: 'TEMPORAL', vigenteHasta: dentroDe(7) });
  });

  it('una temporal sin días vence a los días por defecto: nunca queda sin vencimiento', () => {
    expect(
      vigenciaSegunCategoria({ tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: null }, desde, 30),
    ).toEqual({ tipoVigencia: 'TEMPORAL', vigenteHasta: dentroDe(30) });
  });
});

describe('vigenciaRenovada', () => {
  // `desde` hace de «ahora»: el momento en que el vecino confirma.
  const conDias = (dias: number | null) => ({ diasCaducidadDefault: dias });
  const temporal = (vigenteHasta: Date | null) => ({ tipoVigencia: 'TEMPORAL', vigenteHasta }) as const;

  it('un permanente queda igual, aunque su categoría tenga días cargados', () => {
    const permanente = { tipoVigencia: 'PERMANENTE', vigenteHasta: null } as const;
    expect(vigenciaRenovada(permanente, conDias(7), desde, 30)).toEqual(permanente);
  });

  it('un temporal pasa a vencer a los días de su categoría contados desde ahora', () => {
    expect(vigenciaRenovada(temporal(dentroDe(2)), conDias(7), desde, 30)).toEqual(temporal(dentroDe(7)));
  });

  it('si ya vencía más tarde, conserva su fecha: confirmar nunca acorta la vigencia', () => {
    expect(vigenciaRenovada(temporal(dentroDe(20)), conDias(7), desde, 30)).toEqual(temporal(dentroDe(20)));
  });

  it('si vencía justo en ahora + días, queda igual', () => {
    expect(vigenciaRenovada(temporal(dentroDe(7)), conDias(7), desde, 30)).toEqual(temporal(dentroDe(7)));
  });

  it('con una categoría sin días usa los días por defecto', () => {
    expect(vigenciaRenovada(temporal(dentroDe(2)), conDias(null), desde, 30)).toEqual(temporal(dentroDe(30)));
  });

  it('un temporal sin fecha (la base no lo permite) recibe una', () => {
    expect(vigenciaRenovada(temporal(null), conDias(7), desde, 30)).toEqual(temporal(dentroDe(7)));
  });
});

describe('vigenciaDeCategoria', () => {
  // Un cliente que devuelve estos valores para vigencia.dias_default: así no se toca el parámetro de la
  // base, que leen los demás tests en paralelo.
  const conParametro = (...valores: string[]) =>
    ({
      parametroSistema: {
        findMany: async () => valores.map((valor) => ({ clave: 'vigencia.dias_default', valor })),
      },
    }) as unknown as Prisma.TransactionClient;
  const temporalSinDias = { tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: null } as const;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('una temporal sin días usa vigencia.dias_default', async () => {
    const aviso = vi.spyOn(logger, 'warn');

    expect(await vigenciaDeCategoria(temporalSinDias, desde, conParametro('12'))).toEqual({
      tipoVigencia: 'TEMPORAL',
      vigenteHasta: dentroDe(12),
    });
    expect(aviso).not.toHaveBeenCalled();
  });

  it('sin el parámetro, o si no es un entero positivo, usa 30 días y lo avisa en el log', async () => {
    const aviso = vi.spyOn(logger, 'warn');

    for (const cliente of [conParametro(), conParametro('0'), conParametro('-5'), conParametro('2.5')]) {
      expect(await vigenciaDeCategoria(temporalSinDias, desde, cliente)).toEqual({
        tipoVigencia: 'TEMPORAL',
        vigenteHasta: dentroDe(30),
      });
    }
    expect(aviso).toHaveBeenCalledTimes(4);
    expect(aviso).toHaveBeenCalledWith(expect.any(String), 'vigencia.dias_default', 30);
  });

  it('con los días de la categoría, el parámetro no cuenta', async () => {
    const categoria = { tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: 7 } as const;
    expect((await vigenciaDeCategoria(categoria, desde, conParametro('12'))).vigenteHasta).toEqual(
      dentroDe(7),
    );
  });

  it('al confirmar, un temporal cuya categoría no tiene días renueva con vigencia.dias_default', async () => {
    const vigencia = { tipoVigencia: 'TEMPORAL', vigenteHasta: dentroDe(2) } as const;
    expect(
      await vigenciaAlConfirmar(vigencia, { diasCaducidadDefault: null }, desde, conParametro('12')),
    ).toEqual({ tipoVigencia: 'TEMPORAL', vigenteHasta: dentroDe(12) });
  });
});
