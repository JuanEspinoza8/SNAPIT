/** Lo que se manda para generar un informe (POST /api/informes). */
export interface PedidoInforme {
  /** AAAA-MM-DD. */
  desde: string;
  hasta: string;
  areaId: number | null;
  barrio: string | null;
}

export interface Referencia {
  id: number;
  nombre: string;
}

/** Un informe del historial (GET /api/informes), sin el contenido. */
export interface ResumenInforme {
  id: number;
  desde: string;
  hasta: string;
  /** Null: todo el organismo. */
  area: Referencia | null;
  /** Null: todos los barrios. */
  barrio: string | null;
  /** Null si su cuenta se borró. */
  solicitante: Referencia | null;
  creadoEn: string;
}

/** Un informe completo (GET /api/informes/:id). Las métricas no se muestran: van en el PDF. */
export interface Informe extends ResumenInforme {
  /** En secciones que empiezan con `## Título`. */
  contenido: string;
  registroIaId: number | null;
}
