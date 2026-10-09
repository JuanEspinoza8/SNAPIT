import { describe, expect, it } from 'vitest';
import { crearAgrupador, ZOOM_MAXIMO } from '../src/funcionalidades/mapa/agrupar.js';
import type { PuntoMapa } from '../src/funcionalidades/mapa/tipos.js';

const punto = (id: number, lat: number, lon: number): PuntoMapa => ({
  id,
  lat,
  lon,
  categoriaId: 1,
  categoriaNombre: 'Pozo',
  estado: 'VERIFICADO',
  enRevision: false,
  primerReporteEn: '2026-10-01T12:00:00.000Z',
  cantidadReportes: 1,
});

// Tres incidentes a pocas cuadras en el centro de Neuquén y uno en Cipolletti.
const puntos = [
  punto(1, -38.9516, -68.0591),
  punto(2, -38.9521, -68.0585),
  punto(3, -38.9512, -68.0598),
  punto(4, -38.9393, -67.9946),
];
const zonaAmplia = { oeste: -68.2, sur: -39.1, este: -67.8, norte: -38.8 };

describe('agrupación de puntos', () => {
  it('al alejar el zoom, los puntos cercanos se juntan en un grupo con la cantidad', () => {
    const elementos = crearAgrupador(puntos)(zonaAmplia, 11);

    const grupo = elementos.find((elemento) => elemento.tipo === 'grupo');
    expect(grupo).toMatchObject({ tipo: 'grupo', cantidad: 3 });
    expect(elementos).toHaveLength(2);
  });

  it('al acercarlo se separan', () => {
    const elementos = crearAgrupador(puntos)(zonaAmplia, 18);

    expect(elementos.every((elemento) => elemento.tipo === 'punto')).toBe(true);
    expect(elementos).toHaveLength(4);
  });

  it('el grupo dice a qué zoom hay que ir para abrirlo', () => {
    const elementos = crearAgrupador(puntos)(zonaAmplia, 11);
    const grupo = elementos.find((elemento) => elemento.tipo === 'grupo');

    expect(grupo?.tipo === 'grupo' && grupo.zoomParaAbrir).toBeGreaterThan(11);
  });

  it('solo devuelve lo que entra en la vista', () => {
    const soloCipolletti = { oeste: -68.0, sur: -38.95, este: -67.98, norte: -38.93 };

    const elementos = crearAgrupador(puntos)(soloCipolletti, 18);

    expect(elementos).toEqual([{ tipo: 'punto', clave: 'punto-4', punto: puntos[3] }]);
  });

  it('dos incidentes en el mismo lugar no se separan ni con el zoom máximo: el grupo trae la lista', () => {
    // Dos vecinos reportaron el mismo pozo: hasta que haya agrupación, son dos incidentes.
    const mismoPozo = [punto(10, -38.9516, -68.0591), punto(11, -38.9516, -68.0591)];

    const elementos = crearAgrupador(mismoPozo)(zonaAmplia, ZOOM_MAXIMO);

    expect(elementos).toEqual([
      expect.objectContaining({ tipo: 'superpuestos', puntos: expect.arrayContaining(mismoPozo) }),
    ]);
  });

  it('un grupo que incluye superpuestos se abre acercando hasta separar a los demás', () => {
    const mismoPozo = [punto(10, -38.9516, -68.0591), punto(11, -38.9516, -68.0591)];
    const aLaVuelta = punto(12, -38.9521, -68.0585);
    const agrupar = crearAgrupador([...mismoPozo, aLaVuelta]);

    const alejado = agrupar(zonaAmplia, 11);
    expect(alejado).toEqual([expect.objectContaining({ tipo: 'grupo', cantidad: 3 })]);

    const acercado = agrupar(zonaAmplia, ZOOM_MAXIMO);
    expect(acercado.map((elemento) => elemento.tipo).sort()).toEqual(['punto', 'superpuestos']);
  });
});
