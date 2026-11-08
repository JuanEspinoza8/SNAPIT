import { describe, expect, it, vi } from 'vitest';
import {
  conTareasAlConfirmar,
  despuesDeConfirmar,
  esperarTareasPendientes,
} from '../src/compartido/despuesDeConfirmar.js';

describe('despuesDeConfirmar', () => {
  it('lo pedido dentro de la transacción corre recién cuando termina bien', async () => {
    const orden: string[] = [];

    await conTareasAlConfirmar(async () => {
      despuesDeConfirmar(async () => {
        orden.push('aviso');
      });
      orden.push('fin de la transacción');
    });
    await esperarTareasPendientes();

    expect(orden).toEqual(['fin de la transacción', 'aviso']);
  });

  it('si la transacción falla, lo pedido se descarta', async () => {
    const tarea = vi.fn(async () => {});

    await expect(
      conTareasAlConfirmar(async () => {
        despuesDeConfirmar(tarea);
        throw new Error('se deshizo');
      }),
    ).rejects.toThrow('se deshizo');
    await esperarTareasPendientes();

    expect(tarea).not.toHaveBeenCalled();
  });

  it('fuera de una transacción corre enseguida, y si falla no rompe a quien la pidió', async () => {
    const tarea = vi.fn(async () => {
      throw new Error('FCM caído');
    });

    despuesDeConfirmar(tarea);
    await esperarTareasPendientes();

    expect(tarea).toHaveBeenCalledOnce();
  });
});
