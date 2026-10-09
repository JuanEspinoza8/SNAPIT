import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../src/compartido/red/error.js';
import { repartirErrores } from '../src/compartido/red/erroresPorCampo.js';

const campos = { email: 'correo', organismoId: 'organismo' } as const;

describe('repartirErrores', () => {
  it('pone cada detalle en su campo, traduciendo el nombre de la API', () => {
    const error = new ErrorApi('Hay datos inválidos', 'DATOS_INVALIDOS', 400, [
      { campo: 'email', mensaje: 'No es un correo válido' },
      { campo: 'organismoId', mensaje: 'El organismo está inactivo' },
    ]);

    expect(repartirErrores(error, campos)).toEqual({
      porCampo: { correo: 'No es un correo válido', organismo: 'El organismo está inactivo' },
      sinCampo: false,
    });
  });

  it('un detalle de un campo que el formulario no tiene va al aviso general', () => {
    const error = new ErrorApi('Hay datos inválidos', 'DATOS_INVALIDOS', 400, [
      { campo: 'email', mensaje: 'No es un correo válido' },
      { campo: 'rol', mensaje: 'Tiene que ser OPERADOR o ADMINISTRADOR' },
    ]);

    expect(repartirErrores(error, campos)).toEqual({
      porCampo: { correo: 'No es un correo válido' },
      sinCampo: true,
    });
  });

  it('un error sin detalles va al aviso general', () => {
    const error = new ErrorApi('No tenés permiso', 'SIN_PERMISO', 403);

    expect(repartirErrores(error, campos)).toEqual({ porCampo: {}, sinCampo: true });
  });

  it('el correo repetido cae en el campo del correo', () => {
    const error = new ErrorApi('Ya hay una cuenta con ese correo', 'EMAIL_EN_USO', 409);

    expect(repartirErrores(error, campos)).toEqual({
      porCampo: { correo: 'Ya hay una cuenta con ese correo' },
      sinCampo: false,
    });
  });

  it('el correo repetido va al aviso general si el formulario no tiene correo', () => {
    const error = new ErrorApi('Ya hay una cuenta con ese correo', 'EMAIL_EN_USO', 409);

    expect(repartirErrores(error, { clave: 'clave' })).toEqual({ porCampo: {}, sinCampo: true });
  });

  it('si un campo trae dos detalles, queda el primero', () => {
    const error = new ErrorApi('Hay datos inválidos', 'DATOS_INVALIDOS', 400, [
      { campo: 'email', mensaje: 'Es obligatorio' },
      { campo: 'email', mensaje: 'No es un correo válido' },
    ]);

    expect(repartirErrores(error, campos).porCampo).toEqual({ correo: 'Es obligatorio' });
  });
});
