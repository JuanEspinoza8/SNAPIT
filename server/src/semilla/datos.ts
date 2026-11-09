import { fileURLToPath } from 'node:url';
import type { RolUsuario, TipoVigencia } from '@prisma/client';
import type { Efecto, ReglaTramo } from '../modulos/recorridos/calculo.js';

/**
 * Datos iniciales del sistema. Los valores están explicados en docs/calculos.md: si cambiás uno acá,
 * actualizalo también allá.
 */

/**
 * El polígono de cada zona piloto (por qué se eligió, en docs/calculos.md). Está fuera de server/: en el
 * contenedor, docker-compose.yml monta db/datos/ en /db/datos, que queda a la misma distancia de dist/semilla/.
 */
export const ARCHIVO_ZONAS_PILOTO = fileURLToPath(
  new URL('../../../db/datos/zona-piloto.geojson', import.meta.url),
);

export const ORGANISMO = {
  nombre: 'Municipalidad de Neuquén',
  descripcion: 'Ejido de la ciudad de Neuquén',
};

export const AREAS = [
  { nombre: 'Bacheo', descripcion: 'Pozos y hundimientos en calzadas' },
  { nombre: 'Veredas', descripcion: 'Veredas, cordones y rampas' },
  { nombre: 'Alumbrado', descripcion: 'Luminarias del alumbrado público' },
  { nombre: 'Obras', descripcion: 'Obras públicas y privadas en la vía pública' },
  { nombre: 'Arbolado', descripcion: 'Árboles y ramas en la vía pública' },
  { nombre: 'Desagües', descripcion: 'Desagües, alcantarillas, anegamientos y pérdidas de agua' },
  { nombre: 'Higiene urbana', descripcion: 'Basura y escombros en la vía pública' },
  { nombre: 'Tránsito', descripcion: 'Semáforos, señales y sendas peatonales' },
  { nombre: 'Atención general', descripcion: 'Lo que no encaja en otra área: se reclasifica al revisarlo' },
] as const;

type NombreArea = (typeof AREAS)[number]['nombre'];

export const CATEGORIAS: {
  nombre: string;
  descripcion: string;
  area: NombreArea;
  tipoVigencia: TipoVigencia;
  diasCaducidad: number | null;
  peso: string;
}[] = [
  {
    nombre: 'Pozo en la calzada',
    descripcion: 'Pozo o hundimiento en la calle que dificulta cruzar',
    area: 'Bacheo',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.50',
  },
  {
    nombre: 'Vereda rota',
    descripcion: 'Baldosas levantadas, faltantes o vereda hundida',
    area: 'Veredas',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.30',
  },
  {
    nombre: 'Cordón sin rampa',
    descripcion: 'Esquina sin rampa o con la rampa rota o bloqueada',
    area: 'Veredas',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.40',
  },
  {
    nombre: 'Luminaria apagada',
    descripcion: 'Luz de la calle apagada o que funciona de a ratos',
    area: 'Alumbrado',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.00',
  },
  {
    nombre: 'Obra que interrumpe el paso',
    descripcion: 'Obra, zanja o materiales que cortan la vereda',
    area: 'Obras',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 30,
    peso: '1.20',
  },
  // Las que siguen se sumaron para que la IA no fuerce una foto en una categoría que no le corresponde. La
  // descripción la lee la IA al clasificar: dice qué se ve en la foto, no quién lo arregla.
  {
    nombre: 'Tapa de cámara o alcantarilla',
    descripcion:
      'Tapa faltante, rota o hundida de una cámara, boca de registro o alcantarilla en la calle o la vereda',
    area: 'Bacheo',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.80',
  },
  {
    nombre: 'Desnivel o escalón en la vereda',
    descripcion:
      'Escalón, rampa empinada o diferencia de altura entre partes de la vereda, sin que esté rota',
    area: 'Veredas',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.30',
  },
  {
    nombre: 'Obstáculo en la vereda',
    descripcion:
      'Auto estacionado, mercadería, cartel, mesas u otro objeto que ocupa la vereda o tapa una rampa',
    area: 'Veredas',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 3,
    peso: '1.10',
  },
  {
    nombre: 'Poste dañado o cables colgando',
    descripcion: 'Columna de luz inclinada o rota, o cables sueltos o colgando a baja altura',
    area: 'Alumbrado',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.80',
  },
  {
    nombre: 'Árbol o rama caída',
    descripcion: 'Árbol caído o rama grande en la calle o la vereda, que corta o dificulta el paso',
    area: 'Arbolado',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 7,
    peso: '1.70',
  },
  {
    nombre: 'Rama baja o árbol que obstruye',
    descripcion: 'Ramas a la altura de la cabeza o un árbol que ocupa el paso de la vereda',
    area: 'Arbolado',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.20',
  },
  {
    nombre: 'Raíces que levantan la vereda',
    descripcion: 'Raíces de un árbol que rompen o levantan las baldosas de la vereda',
    area: 'Arbolado',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.30',
  },
  {
    nombre: 'Desagüe tapado o calle anegada',
    descripcion: 'Agua acumulada en la calle o la esquina, o un desagüe o rejilla tapados',
    area: 'Desagües',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 7,
    peso: '1.30',
  },
  {
    nombre: 'Pérdida de agua',
    descripcion: 'Agua que brota o corre por la vereda o la calle desde una cañería',
    area: 'Desagües',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 15,
    peso: '1.10',
  },
  {
    nombre: 'Basura o escombros',
    descripcion: 'Bolsas de basura, residuos o escombros acumulados en la vereda o la calle',
    area: 'Higiene urbana',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 7,
    peso: '1.00',
  },
  {
    nombre: 'Semáforo que no funciona',
    descripcion: 'Semáforo apagado, roto o con una luz que no enciende',
    area: 'Tránsito',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 7,
    peso: '1.60',
  },
  {
    nombre: 'Señal de tránsito caída o faltante',
    descripcion: 'Cartel de tránsito caído, doblado, tapado o que falta',
    area: 'Tránsito',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.10',
  },
  {
    nombre: 'Senda peatonal despintada',
    descripcion: 'Senda peatonal o cruce con la pintura gastada o que no se ve',
    area: 'Tránsito',
    tipoVigencia: 'PERMANENTE',
    diasCaducidad: null,
    peso: '1.00',
  },
  {
    // La última opción: si nada encaja, mejor esta que forzar otra. El operador la cambia al revisarlo.
    nombre: 'Otro problema en la vía pública',
    descripcion: 'Solo si el problema no corresponde a ninguna de las otras categorías',
    area: 'Atención general',
    tipoVigencia: 'TEMPORAL',
    diasCaducidad: 30,
    peso: '1.00',
  },
];

type NombreCategoria = (typeof CATEGORIAS)[number]['nombre'];

export const PERFILES = [
  { nombre: 'Silla de ruedas', descripcion: 'No puede subir cordones ni pasar por superficies rotas' },
  { nombre: 'Bastón o andador', descripcion: 'Camina con apoyo: le cuestan los desniveles y los pozos' },
  { nombre: 'Coche de bebé', descripcion: 'Necesita veredas parejas y rampas en las esquinas' },
  { nombre: 'Baja visión', descripcion: 'Depende de la iluminación y de la continuidad de la vereda' },
] as const;

type NombrePerfil = (typeof PERFILES)[number]['nombre'];

/** Cuánto le estorba a cada perfil un incidente de cada categoría (categoria_perfil). */
export const MATRIZ_CATEGORIA_PERFIL: Record<NombreCategoria, Record<NombrePerfil, Efecto>> = {
  'Pozo en la calzada': {
    'Silla de ruedas': 3.0,
    'Bastón o andador': 2.0,
    'Coche de bebé': 2.0,
    'Baja visión': 2.5,
  },
  'Vereda rota': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 2.0,
    'Coche de bebé': 2.5,
    'Baja visión': 2.5,
  },
  'Cordón sin rampa': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 1.5,
    'Coche de bebé': 'intransitable',
    'Baja visión': 1.5,
  },
  'Luminaria apagada': {
    'Silla de ruedas': 1.2,
    'Bastón o andador': 1.5,
    'Coche de bebé': 1.2,
    'Baja visión': 3.0,
  },
  'Obra que interrumpe el paso': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 'intransitable',
    'Coche de bebé': 'intransitable',
    'Baja visión': 'intransitable',
  },
  // Una tapa faltante es un pozo profundo: nadie debería pasar por ahí.
  'Tapa de cámara o alcantarilla': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 'intransitable',
    'Coche de bebé': 'intransitable',
    'Baja visión': 'intransitable',
  },
  'Desnivel o escalón en la vereda': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 2.0,
    'Coche de bebé': 2.0,
    'Baja visión': 2.0,
  },
  'Obstáculo en la vereda': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 1.8,
    'Coche de bebé': 'intransitable',
    'Baja visión': 2.5,
  },
  'Poste dañado o cables colgando': {
    'Silla de ruedas': 1.5,
    'Bastón o andador': 1.5,
    'Coche de bebé': 1.5,
    'Baja visión': 2.5,
  },
  'Árbol o rama caída': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 'intransitable',
    'Coche de bebé': 'intransitable',
    'Baja visión': 'intransitable',
  },
  // A la altura de la cabeza: para quien no la ve es un golpe; en silla o con coche se pasa por abajo.
  'Rama baja o árbol que obstruye': {
    'Silla de ruedas': 1.3,
    'Bastón o andador': 1.5,
    'Coche de bebé': 1.3,
    'Baja visión': 3.0,
  },
  'Raíces que levantan la vereda': {
    'Silla de ruedas': 'intransitable',
    'Bastón o andador': 2.0,
    'Coche de bebé': 2.5,
    'Baja visión': 2.5,
  },
  'Desagüe tapado o calle anegada': {
    'Silla de ruedas': 2.5,
    'Bastón o andador': 2.0,
    'Coche de bebé': 2.0,
    'Baja visión': 2.0,
  },
  'Pérdida de agua': {
    'Silla de ruedas': 1.5,
    'Bastón o andador': 1.5,
    'Coche de bebé': 1.3,
    'Baja visión': 1.5,
  },
  'Basura o escombros': {
    'Silla de ruedas': 2.0,
    'Bastón o andador': 1.5,
    'Coche de bebé': 1.8,
    'Baja visión': 2.0,
  },
  // Sin semáforo, cruzar es mucho más riesgoso para quien no ve o cruza más lento.
  'Semáforo que no funciona': {
    'Silla de ruedas': 2.0,
    'Bastón o andador': 2.5,
    'Coche de bebé': 1.5,
    'Baja visión': 3.0,
  },
  'Señal de tránsito caída o faltante': {
    'Silla de ruedas': 1.2,
    'Bastón o andador': 1.2,
    'Coche de bebé': 1.2,
    'Baja visión': 1.5,
  },
  'Senda peatonal despintada': {
    'Silla de ruedas': 1.2,
    'Bastón o andador': 1.3,
    'Coche de bebé': 1.2,
    'Baja visión': 2.0,
  },
  // No se sabe qué es: pesa poco hasta que el operador lo reclasifique.
  'Otro problema en la vía pública': {
    'Silla de ruedas': 1.2,
    'Bastón o andador': 1.2,
    'Coche de bebé': 1.2,
    'Baja visión': 1.2,
  },
};

/**
 * Cómo pesa cada atributo del tramo para cada perfil (#102). Se guarda en parametro_sistema como
 * ruteo.<regla>.perfil_<id>, con tipo 'factor'. Un 1 no le cambia el costo: va igual, para que el administrador
 * vea la regla y la pueda activar.
 */
export const ATRIBUTOS_TRAMO_PERFIL: Record<
  ReglaTramo,
  { describe: string; efectos: Record<NombrePerfil, Efecto> }
> = {
  escalera: {
    describe: 'una escalera',
    efectos: {
      'Silla de ruedas': 'intransitable',
      'Bastón o andador': 2.0,
      'Coche de bebé': 'intransitable',
      'Baja visión': 1.5,
    },
  },
  sin_rampa: {
    describe: 'un tramo sin rampa',
    efectos: { 'Silla de ruedas': 3.0, 'Bastón o andador': 1.5, 'Coche de bebé': 2.0, 'Baja visión': 1.5 },
  },
  pendiente: {
    describe: 'un tramo con más pendiente que ruteo.pendiente_max_porcentaje',
    efectos: { 'Silla de ruedas': 3.0, 'Bastón o andador': 1.5, 'Coche de bebé': 1.5, 'Baja visión': 1.0 },
  },
  sin_pavimentar: {
    describe: 'un tramo sin pavimentar (tierra, ripio, pasto...)',
    efectos: { 'Silla de ruedas': 2.0, 'Bastón o andador': 1.5, 'Coche de bebé': 1.5, 'Baja visión': 1.2 },
  },
  angosto: {
    describe: 'un tramo más angosto que ruteo.ancho_min_m',
    efectos: {
      'Silla de ruedas': 'intransitable',
      'Bastón o andador': 1.0,
      'Coche de bebé': 'intransitable',
      'Baja visión': 1.0,
    },
  },
  cruce_sin_senal: {
    describe: 'un cruce sin semáforo sonoro ni piso podotáctil en sus extremos',
    efectos: { 'Silla de ruedas': 1.0, 'Bastón o andador': 1.0, 'Coche de bebé': 1.0, 'Baja visión': 1.5 },
  },
};

export const PARAMETROS: { clave: string; valor: string; tipo: 'entero' | 'decimal'; descripcion: string }[] =
  [
    // Verificación automática del reporte (nivel de confianza de 0 a 100)
    {
      clave: 'verificacion.confianza_base',
      valor: '50',
      tipo: 'entero',
      descripcion: 'Nivel de confianza con el que arranca todo reporte, antes de sumar las señales',
    },
    {
      clave: 'verificacion.umbral_verificado',
      valor: '60',
      tipo: 'entero',
      descripcion:
        'Desde este nivel el reporte queda verificado. Por debajo queda pendiente de revisión: el sistema nunca lo desestima solo',
    },
    {
      clave: 'verificacion.distancia_exif_max_m',
      valor: '100',
      tipo: 'entero',
      descripcion:
        'Distancia máxima, en metros, entre la ubicación EXIF de la foto y el punto enviado para considerar que coinciden',
    },
    {
      clave: 'verificacion.valor_exif_coincide',
      valor: '20',
      tipo: 'decimal',
      descripcion: 'Suma si la ubicación EXIF de la foto coincide con el punto enviado',
    },
    {
      clave: 'verificacion.valor_exif_no_coincide',
      valor: '-30',
      tipo: 'decimal',
      descripcion: 'Resta si la ubicación EXIF de la foto queda más lejos que la distancia máxima',
    },
    {
      clave: 'verificacion.valor_exif_ausente',
      valor: '-10',
      tipo: 'decimal',
      descripcion: 'Resta si una foto subida de la galería no trae ubicación EXIF',
    },
    {
      clave: 'verificacion.hamming_duplicado_max',
      valor: '6',
      tipo: 'entero',
      descripcion:
        'Bits distintos, como máximo, entre dos hashes perceptuales para considerar que son la misma foto',
    },
    {
      clave: 'verificacion.valor_hash_duplicado',
      valor: '-40',
      tipo: 'decimal',
      descripcion: 'Resta si la misma foto ya se usó en otro reporte',
    },
    {
      clave: 'verificacion.valor_origen_app',
      valor: '15',
      tipo: 'decimal',
      descripcion: 'Suma si la foto se sacó con la cámara de la app',
    },
    {
      clave: 'verificacion.valor_reputacion_max',
      valor: '20',
      tipo: 'decimal',
      descripcion: 'Lo máximo que la reputación del vecino suma o resta',
    },
    {
      clave: 'verificacion.dias_foto_antigua',
      valor: '7',
      tipo: 'entero',
      descripcion: 'Días entre la foto y el reporte a partir de los cuales la foto se considera antigua',
    },
    {
      clave: 'verificacion.valor_fecha_antigua',
      valor: '-20',
      tipo: 'decimal',
      descripcion: 'Resta si la foto es antigua',
    },

    // Agrupación de reportes en incidentes
    {
      clave: 'agrupacion.radio_m',
      valor: '30',
      tipo: 'entero',
      descripcion: 'Distancia máxima, en metros, entre un reporte nuevo y un incidente candidato',
    },
    {
      clave: 'agrupacion.ventana_dias',
      valor: '30',
      tipo: 'entero',
      descripcion: 'Antigüedad máxima, en días, del último reporte de un incidente candidato',
    },
    {
      clave: 'agrupacion.peso_distancia',
      valor: '0.5',
      tipo: 'decimal',
      descripcion: 'Peso de la cercanía en el puntaje de agrupación',
    },
    {
      clave: 'agrupacion.peso_tiempo',
      valor: '0.2',
      tipo: 'decimal',
      descripcion: 'Peso del tiempo transcurrido en el puntaje de agrupación',
    },
    {
      clave: 'agrupacion.peso_foto',
      valor: '0.3',
      tipo: 'decimal',
      descripcion: 'Peso del parecido entre las fotos en el puntaje de agrupación',
    },
    {
      clave: 'agrupacion.umbral',
      valor: '0.5',
      tipo: 'decimal',
      descripcion:
        'Puntaje que hay que superar para sumar el reporte a un incidente. Si ningún candidato lo supera, se crea uno nuevo',
    },
    {
      clave: 'agrupacion.unos_minimos_hash',
      valor: '16',
      tipo: 'entero',
      descripcion:
        'Unos mínimos del hash perceptual para comparar la foto. Una foto lisa u oscura tiene menos y no suma parecido',
    },

    // Prioridad del incidente
    {
      clave: 'prioridad.peso_severidad',
      valor: '40',
      tipo: 'decimal',
      descripcion: 'Peso de la gravedad del incidente',
    },
    {
      clave: 'prioridad.peso_evidencias',
      valor: '25',
      tipo: 'decimal',
      descripcion: 'Peso de la cantidad de vecinos que lo informaron o confirmaron',
    },
    {
      clave: 'prioridad.tope_evidencias',
      valor: '15',
      tipo: 'entero',
      descripcion: 'Reportes y confirmaciones a partir de los cuales el factor de evidencias no crece más',
    },
    {
      clave: 'prioridad.peso_antiguedad',
      valor: '20',
      tipo: 'decimal',
      descripcion: 'Peso de los días que lleva sin resolverse',
    },
    {
      clave: 'prioridad.tope_antiguedad_dias',
      valor: '60',
      tipo: 'entero',
      descripcion: 'Días a partir de los cuales el factor de antigüedad no crece más',
    },
    {
      clave: 'prioridad.peso_contexto',
      valor: '15',
      tipo: 'decimal',
      descripcion: 'Peso de la cercanía a un punto de interés',
    },
    {
      clave: 'prioridad.radio_contexto_m',
      valor: '150',
      tipo: 'entero',
      descripcion: 'Distancia máxima, en metros, a un punto de interés para que sume prioridad',
    },
    {
      clave: 'prioridad.factor_escuela',
      valor: '1.0',
      tipo: 'decimal',
      descripcion: 'Cuánto del peso de contexto suma una escuela cercana',
    },
    {
      clave: 'prioridad.factor_centro_salud',
      valor: '1.0',
      tipo: 'decimal',
      descripcion: 'Cuánto del peso de contexto suma un centro de salud cercano',
    },
    {
      clave: 'prioridad.factor_parada',
      valor: '0.6',
      tipo: 'decimal',
      descripcion: 'Cuánto del peso de contexto suma una parada de transporte cercana',
    },
    {
      clave: 'prioridad.factor_edificio_publico',
      valor: '0.5',
      tipo: 'decimal',
      descripcion: 'Cuánto del peso de contexto suma un edificio público cercano',
    },

    // Cierre con foto
    {
      clave: 'cierre.distancia_max_m',
      valor: '50',
      tipo: 'entero',
      descripcion: 'Distancia máxima, en metros, entre la foto de cierre y el incidente',
    },

    // Vigencia
    {
      clave: 'vigencia.dias_default',
      valor: '30',
      tipo: 'entero',
      descripcion: 'Días de vigencia de un incidente temporal cuando su categoría no los define',
    },

    // Recorridos
    {
      clave: 'ruteo.radio_obstruccion_m',
      valor: '15',
      tipo: 'entero',
      descripcion:
        'Distancia, en metros, alrededor de un incidente dentro de la cual los tramos quedan afectados',
    },
    {
      clave: 'ruteo.distancia_max_al_nodo_m',
      valor: '100',
      tipo: 'entero',
      descripcion:
        'Distancia máxima, en metros, para acercar el origen o el destino al nodo más cercano de la red',
    },
    {
      clave: 'ruteo.velocidad_m_por_min',
      valor: '50',
      tipo: 'decimal',
      descripcion: 'Velocidad al caminar, en metros por minuto, para estimar el tiempo del recorrido',
    },
    {
      clave: 'ruteo.pendiente_max_porcentaje',
      valor: '8',
      tipo: 'decimal',
      descripcion:
        'Pendiente, en %, desde la que un tramo cuenta como empinado, subiendo o bajando (reglas ruteo.pendiente.perfil_<id>)',
    },
    {
      clave: 'ruteo.ancho_min_m',
      valor: '0.9',
      tipo: 'decimal',
      descripcion:
        'Ancho, en metros, por debajo del cual un tramo cuenta como angosto (reglas ruteo.angosto.perfil_<id>)',
    },
    // Demostración de la cola de verificación con IA
    {
      clave: 'demo.revision_manual',
      valor: '0',
      tipo: 'entero',
      descripcion:
        'Con 1, todo reporte nuevo queda pendiente de revisión aunque la verificación automática lo aprobaría, para procesar la cola a mano o con la IA. Con 0, funciona como en producción',
    },
  ];

/** Clave común de los usuarios de prueba. Solo existe en este archivo y solo se carga fuera de producción. */
export const CLAVE_USUARIOS_PRUEBA = 'snapit-desarrollo';

export const USUARIOS_PRUEBA: { email: string; nombre: string; rol: RolUsuario; area?: NombreArea }[] = [
  { email: 'admin@snapit.test', nombre: 'Administración Municipal', rol: 'ADMINISTRADOR' },
  { email: 'bacheo@snapit.test', nombre: 'Operador de Bacheo', rol: 'OPERADOR', area: 'Bacheo' },
  { email: 'veredas@snapit.test', nombre: 'Operadora de Veredas', rol: 'OPERADOR', area: 'Veredas' },
  { email: 'vecino1@snapit.test', nombre: 'Ana Vecina', rol: 'VECINO' },
  { email: 'vecino2@snapit.test', nombre: 'Bruno Vecino', rol: 'VECINO' },
  { email: 'vecino3@snapit.test', nombre: 'Carla Vecina', rol: 'VECINO' },
];
