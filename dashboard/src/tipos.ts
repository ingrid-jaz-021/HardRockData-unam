export interface Metricas {
  jugadas: number
  pctCompletos: number | null
  yardasPorJugada: number | null
  tasaSacks: number | null
  timeToThrow: number | null
  puntaje: number | null
}

export interface ComparacionPA {
  usarPlayAction: boolean | null
  con: Metricas
  sin: Metricas
  ambito?: string
}

export interface Tramo extends Metricas {
  tramo: string
  desde: number
  hasta: number
}

export interface Resumen {
  kpis: Metricas
  playAction: ComparacionPA
  formaciones: { formacion: string; total: Metricas; conPA: Metricas; sinPA: Metricas }[]
  defensa: (Metricas & { grupo: string })[]
  tttPorResultado: { resultado: string; jugadas: number; promedio: number | null; mediana: number | null }[]
  tttPorTramo: Tramo[]
  pesos: { completos: number; sacks: number }
}

export interface Recomendacion {
  down: string
  distancia: string
  situacion: Metricas
  muestraMinima?: number
  formacion: (Metricas & { formacion: string }) | null
  formaciones?: (Metricas & { formacion: string })[]
  playAction?: ComparacionPA
  tiempoObjetivo?: { ambito: string; tramo: Tramo; medianaCompletos: number | null; tramos: Tramo[] }
  avisos: string[]
}

export type ClaveMetrica = 'yardasPorJugada' | 'pctCompletos' | 'tasaSacks'
