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
        'Puntaje mínimo para sumar el reporte a un incidente. Si ningún candidato lo alcanza, se crea uno nuevo',
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
      descripcion: 'Vecinos a partir de los cuales el factor de evidencias no crece más',
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
