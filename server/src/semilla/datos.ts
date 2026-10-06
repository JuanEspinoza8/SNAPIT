import type { RolUsuario, TipoVigencia } from '@prisma/client';

/**
 * Datos iniciales del sistema. Los valores están explicados en docs/calculos.md: si cambiás uno acá,
 * actualizalo también allá.
 */

export const ORGANISMO = {
  nombre: 'Municipalidad de Neuquén',
  descripcion: 'Ejido de la ciudad de Neuquén',
};

export const AREAS = [
  { nombre: 'Bacheo', descripcion: 'Pozos y hundimientos en calzadas' },
  { nombre: 'Veredas', descripcion: 'Veredas, cordones y rampas' },
  { nombre: 'Alumbrado', descripcion: 'Luminarias del alumbrado público' },
  { nombre: 'Obras', descripcion: 'Obras públicas y privadas en la vía pública' },
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
];

type NombreCategoria = (typeof CATEGORIAS)[number]['nombre'];

export const PERFILES = [
  { nombre: 'Silla de ruedas', descripcion: 'No puede subir cordones ni pasar por superficies rotas' },
  { nombre: 'Bastón o andador', descripcion: 'Camina con apoyo: le cuestan los desniveles y los pozos' },
  { nombre: 'Coche de bebé', descripcion: 'Necesita veredas parejas y rampas en las esquinas' },
  { nombre: 'Baja visión', descripcion: 'Depende de la iluminación y de la continuidad de la vereda' },
] as const;

type NombrePerfil = (typeof PERFILES)[number]['nombre'];

/** Factor por el que se multiplica el costo del tramo, o 'intransitable' si queda bloqueado para ese perfil. */
type Efecto = number | 'intransitable';

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
};

export const PARAMETROS: { clave: string; valor: string; tipo: 'entero' | 'decimal'; descripcion: string }[] =
  [
    // Agrupación de reportes en incidentes
    {
      clave: 'agrupacion.radio_metros',
      valor: '30',
      tipo: 'entero',
      descripcion:
        'Distancia máxima entre un reporte nuevo y un incidente abierto de la misma categoría para sumarlo a ese incidente',
    },
    {
      clave: 'agrupacion.ventana_dias',
      valor: '30',
      tipo: 'entero',
      descripcion: 'Solo se agrupa con incidentes cuyo último reporte tiene a lo sumo esta antigüedad',
    },

    // Verificación automática del reporte (puntaje de 0 a 100)
    {
      clave: 'verificacion.puntaje_base',
      valor: '50',
      tipo: 'entero',
      descripcion: 'Puntaje con el que arranca todo reporte',
    },
    {
      clave: 'verificacion.exif_coincide',
      valor: '20',
      tipo: 'entero',
      descripcion: 'Suma si la ubicación EXIF de la foto está cerca del punto reportado',
    },
    {
      clave: 'verificacion.exif_distancia_max_metros',
      valor: '100',
      tipo: 'entero',
      descripcion: 'Distancia máxima entre el EXIF y el punto reportado para considerar que coinciden',
    },
    {
      clave: 'verificacion.exif_ausente',
      valor: '-10',
      tipo: 'entero',
      descripcion: 'Resta si la foto no trae ubicación EXIF',
    },
    {
      clave: 'verificacion.origen_app',
      valor: '10',
      tipo: 'entero',
      descripcion: 'Suma si el reporte se cargó desde la app (cámara y GPS en el momento)',
    },
    {
      clave: 'verificacion.foto_antigua',
      valor: '-20',
      tipo: 'entero',
      descripcion: 'Resta si la foto se sacó hace más de foto_antigua_horas',
    },
    {
      clave: 'verificacion.foto_antigua_horas',
      valor: '48',
      tipo: 'entero',
      descripcion: 'Antigüedad a partir de la cual una foto se considera vieja',
    },
    {
      clave: 'verificacion.hash_duplicado',
      valor: '-40',
      tipo: 'entero',
      descripcion: 'Resta si la misma foto ya se usó en otro reporte',
    },
    {
      clave: 'verificacion.reputacion_divisor',
      valor: '5',
      tipo: 'entero',
      descripcion: 'La reputación suma (reputación − 50) / divisor: entre −10 y +10',
    },
    {
      clave: 'verificacion.umbral_verificado',
      valor: '70',
      tipo: 'entero',
      descripcion: 'Desde este puntaje el reporte queda verificado sin intervención',
    },
    {
      clave: 'verificacion.umbral_desestimado',
      valor: '30',
      tipo: 'entero',
      descripcion:
        'Hasta este puntaje el reporte se desestima. Entre ambos umbrales, va a revisión de un operador',
    },

    // Reputación del vecino (0 a 100; arranca en 50 por defecto de la base)
    {
      clave: 'reputacion.por_confirmado',
      valor: '2',
      tipo: 'decimal',
      descripcion: 'Suma a la reputación por cada reporte que resultó válido',
    },
    {
      clave: 'reputacion.por_desestimado',
      valor: '-5',
      tipo: 'decimal',
      descripcion: 'Resta a la reputación por cada reporte desestimado',
    },
    { clave: 'reputacion.minima', valor: '0', tipo: 'decimal', descripcion: 'Piso de la reputación' },
    { clave: 'reputacion.maxima', valor: '100', tipo: 'decimal', descripcion: 'Techo de la reputación' },

    // Prioridad del incidente
    {
      clave: 'prioridad.severidad_leve',
      valor: '10',
      tipo: 'entero',
      descripcion: 'Puntos de severidad LEVE, antes de multiplicar por el peso de la categoría',
    },
    {
      clave: 'prioridad.severidad_moderada',
      valor: '20',
      tipo: 'entero',
      descripcion: 'Puntos de severidad MODERADA, antes de multiplicar por el peso de la categoría',
    },
    {
      clave: 'prioridad.severidad_grave',
      valor: '30',
      tipo: 'entero',
      descripcion: 'Puntos de severidad GRAVE, antes de multiplicar por el peso de la categoría',
    },
    {
      clave: 'prioridad.por_reporte_extra',
      valor: '5',
      tipo: 'entero',
      descripcion: 'Puntos por cada reporte agrupado además del primero',
    },
    {
      clave: 'prioridad.max_evidencias',
      valor: '25',
      tipo: 'entero',
      descripcion: 'Tope de puntos por reportes agrupados',
    },
    {
      clave: 'prioridad.por_dia',
      valor: '1',
      tipo: 'entero',
      descripcion: 'Puntos por cada día desde el primer reporte',
    },
    {
      clave: 'prioridad.max_antiguedad',
      valor: '20',
      tipo: 'entero',
      descripcion: 'Tope de puntos por antigüedad',
    },
    {
      clave: 'prioridad.contexto_urbano',
      valor: '15',
      tipo: 'entero',
      descripcion: 'Puntos si hay un punto de interés (hospital, escuela, etc.) cerca',
    },
    {
      clave: 'prioridad.contexto_radio_metros',
      valor: '150',
      tipo: 'entero',
      descripcion: 'Distancia hasta la que se considera que un punto de interés está cerca',
    },

    // Reportes
    {
      clave: 'reporte.max_fotos',
      valor: '3',
      tipo: 'entero',
      descripcion: 'Cantidad máxima de fotos por reporte',
    },
    {
      clave: 'reporte.max_mb_foto',
      valor: '5',
      tipo: 'entero',
      descripcion: 'Tamaño máximo de cada foto, en MB',
    },

    // Avisos
    {
      clave: 'avisos.radio_zona_metros',
      valor: '500',
      tipo: 'entero',
      descripcion: 'Radio por defecto de una zona habitual nueva',
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
