import { useEffect, useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ClaveMetrica, Metricas, Recomendacion, Resumen } from './tipos'

const NARANJA = '#FB4F14'
const NEGRO = '#111111'
const GRIS = '#9CA3AF'

const DOWNS = ['Todos', '1st', '2nd', '3rd'] as const
const DISTANCIAS = ['Todas', 'Corto', 'Medio', 'Largo'] as const

const METRICAS: { clave: ClaveMetrica; nombre: string }[] = [
  { clave: 'yardasPorJugada', nombre: 'Yardas por jugada' },
  { clave: 'pctCompletos', nombre: '% de completos' },
  { clave: 'tasaSacks', nombre: 'Tasa de sacks' },
]

const RESULTADOS: Record<string, string> = { C: 'Completo', I: 'Incompleto', S: 'Sack', IN: 'Intercepción' }

const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d))
const seg = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)} s`)

function formatear(clave: ClaveMetrica, v: number | null | undefined) {
  return clave === 'yardasPorJugada' ? num(v, 2) : pct(v)
}

// Recharts entrega valores sin tipo; esto los convierte para las etiquetas
const etiqueta = (clave: ClaveMetrica) => (v: unknown) => formatear(clave, typeof v === 'number' ? v : null)

async function pedir<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta)
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`)
  return r.json() as Promise<T>
}

export default function App() {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pedir<Resumen>('api/resumen').then(setResumen).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-black text-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: NARANJA }}>
            Cincinnati Bengals · Coordinación ofensiva
          </p>
          <h1 className="text-2xl font-bold">Joe Burrow · Semanas 1–8 de 2021</h1>
          <p className="text-sm text-gray-300">255 jugadas de pase (plays + PFF scouting + tracking)</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {error && <p className="rounded bg-red-100 p-3 text-red-800">No se pudo cargar la API ({error}).</p>}
        <Recomendador />
        {resumen && (
          <>
            <Kpis m={resumen.kpis} />
            <GraficaFormaciones resumen={resumen} />
            <GraficaDefensa resumen={resumen} />
            <GraficaTiempo resumen={resumen} />
            <p className="text-xs text-gray-500">
              Completos = C / (C + I + IN). Yardas por jugada = promedio de playResult (los sacks cuentan como yardas
              negativas). Tasa de sacks = sacks / jugadas. Blitz = 5 o más jugadores con rol "Pass Rush". Presión = algún
              defensor con hit, hurry o sack de PFF. Time to throw = frames entre el snap y pass_forward o qb_sack ÷ 10.
              Los scrambles (R) no tienen time to throw.
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function Tarjeta({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Selector<T extends string>({ opciones, valor, onChange, nombre }: {
  opciones: readonly T[]; valor: T; onChange: (v: T) => void; nombre: (v: T) => string
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md ring-1 ring-gray-300">
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`px-3 py-1.5 text-sm font-medium ${o === valor ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          style={o === valor ? { backgroundColor: NARANJA } : undefined}
        >
          {nombre(o)}
        </button>
      ))}
    </div>
  )
}

function SelectorMetrica({ valor, onChange }: { valor: ClaveMetrica; onChange: (v: ClaveMetrica) => void }) {
  const claves = METRICAS.map((m) => m.clave)
  return <Selector opciones={claves} valor={valor} onChange={onChange} nombre={(c) => METRICAS.find((m) => m.clave === c)!.nombre} />
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{etiqueta}</p>
      <p className="text-xl font-bold">{valor}</p>
      {nota && <p className="text-xs text-gray-500">{nota}</p>}
    </div>
  )
}

function FilaMetricas({ m }: { m: Metricas }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Dato etiqueta="Yardas / jugada" valor={num(m.yardasPorJugada, 2)} />
      <Dato etiqueta="% completos" valor={pct(m.pctCompletos)} />
      <Dato etiqueta="Tasa de sacks" valor={pct(m.tasaSacks)} />
      <Dato etiqueta="Jugadas" valor={String(m.jugadas)} />
    </div>
  )
}

// ---------- Recomendador ----------

function Recomendador() {
  const [down, setDown] = useState<(typeof DOWNS)[number]>('Todos')
  const [distancia, setDistancia] = useState<(typeof DISTANCIAS)[number]>('Todas')
  const [rec, setRec] = useState<Recomendacion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams({ down, distancia })
    pedir<Recomendacion>(`api/recomendacion?${q}`).then((r) => { setRec(r); setError(null) }).catch((e: Error) => setError(e.message))
  }, [down, distancia])

  const nombreDistancia = (d: string) =>
    ({ Todas: 'Todas', Corto: 'Corto (≤3)', Medio: 'Medio (4–7)', Largo: 'Largo (≥8)' })[d] ?? d

  return (
    <section className="rounded-lg border-2 bg-white p-5 shadow-sm" style={{ borderColor: NARANJA }}>
      <h2 className="text-xl font-bold">Recomendador de Jugada Ofensiva para Joe Burrow</h2>
      <p className="mb-4 text-sm text-gray-600">Elige la situación. La recomendación sale de las jugadas reales de Burrow en esa situación.</p>

      <div className="mb-5 flex flex-wrap gap-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Down</p>
          <Selector opciones={DOWNS} valor={down} onChange={setDown} nombre={(d) => d} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Distancia</p>
          <Selector opciones={DISTANCIAS} valor={distancia} onChange={setDistancia} nombre={nombreDistancia} />
        </div>
      </div>

      {error && <p className="text-red-700">No se pudo calcular la recomendación ({error}).</p>}
      {rec && !rec.formacion && <p className="text-gray-600">{rec.avisos.join(' ')}</p>}
      {rec?.formacion && rec.playAction && rec.tiempoObjetivo && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md bg-black p-4 text-white">
              <p className="text-xs uppercase text-gray-400">Formación</p>
              <p className="text-3xl font-extrabold" style={{ color: NARANJA }}>{rec.formacion.formacion}</p>
              <p className="mt-1 text-sm text-gray-300">
                {num(rec.formacion.yardasPorJugada, 2)} yds/jugada · {pct(rec.formacion.pctCompletos)} comp · {pct(rec.formacion.tasaSacks)} sacks · {rec.formacion.jugadas} jugadas
              </p>
            </div>
            <div className="rounded-md bg-black p-4 text-white">
              <p className="text-xs uppercase text-gray-400">Play Action</p>
              <p className="text-3xl font-extrabold" style={{ color: NARANJA }}>
                {rec.playAction.usarPlayAction == null ? 'Sin datos' : rec.playAction.usarPlayAction ? 'Sí' : 'No'}
              </p>
              <p className="mt-1 text-sm text-gray-300">
                Con PA: {num(rec.playAction.con.yardasPorJugada, 2)} yds, {pct(rec.playAction.con.tasaSacks)} sacks ({rec.playAction.con.jugadas})<br />
                Sin PA: {num(rec.playAction.sin.yardasPorJugada, 2)} yds, {pct(rec.playAction.sin.tasaSacks)} sacks ({rec.playAction.sin.jugadas})
              </p>
              <p className="text-xs text-gray-500">Comparado en {rec.playAction.ambito}</p>
            </div>
            <div className="rounded-md bg-black p-4 text-white">
              <p className="text-xs uppercase text-gray-400">Soltar el balón en</p>
              <p className="text-3xl font-extrabold" style={{ color: NARANJA }}>{rec.tiempoObjetivo.tramo.tramo}</p>
              <p className="mt-1 text-sm text-gray-300">
                En ese tramo: {num(rec.tiempoObjetivo.tramo.yardasPorJugada, 2)} yds · {pct(rec.tiempoObjetivo.tramo.pctCompletos)} comp · {pct(rec.tiempoObjetivo.tramo.tasaSacks)} sacks ({rec.tiempoObjetivo.tramo.jugadas})
              </p>
              <p className="text-xs text-gray-500">Mediana de sus completos aquí: {seg(rec.tiempoObjetivo.medianaCompletos)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Situación seleccionada ({down} down, distancia {distancia.toLowerCase()})</p>
            <FilaMetricas m={rec.situacion} />
          </div>

          {rec.avisos.length > 0 && (
            <ul className="list-disc rounded bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
              {rec.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Ver todas las formaciones en esta situación</summary>
            <table className="mt-2 w-full text-left">
              <thead className="text-xs uppercase text-gray-500">
                <tr><th className="py-1">Formación</th><th>Jugadas</th><th>Yds/jugada</th><th>% comp</th><th>% sacks</th><th>Puntaje</th></tr>
              </thead>
              <tbody>
                {rec.formaciones?.map((f) => (
                  <tr key={f.formacion} className={`border-t ${f.formacion === rec.formacion?.formacion ? 'font-bold' : ''} ${f.jugadas < (rec.muestraMinima ?? 0) ? 'text-gray-400' : ''}`}>
                    <td className="py-1">{f.formacion}</td><td>{f.jugadas}</td><td>{num(f.yardasPorJugada, 2)}</td>
                    <td>{pct(f.pctCompletos)}</td><td>{pct(f.tasaSacks)}</td><td>{num(f.puntaje, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">
              Puntaje = yds/jugada + 5 × %comp − 10 × %sacks. Solo compiten las formaciones con al menos {rec.muestraMinima} jugadas (en gris las que no llegan).
            </p>
          </details>
        </div>
      )}
    </section>
  )
}

// ---------- KPIs ----------

function Kpis({ m }: { m: Metricas }) {
  const items = [
    { etiqueta: 'Total de jugadas', valor: String(m.jugadas) },
    { etiqueta: '% de completos', valor: pct(m.pctCompletos) },
    { etiqueta: 'Yardas por jugada', valor: num(m.yardasPorJugada, 2) },
    { etiqueta: 'Tasa de sacks', valor: pct(m.tasaSacks) },
    { etiqueta: 'Time to throw promedio', valor: seg(m.timeToThrow) },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {items.map((i) => (
        <div key={i.etiqueta} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs uppercase tracking-wide text-gray-500">{i.etiqueta}</p>
          <p className="text-2xl font-extrabold">{i.valor}</p>
        </div>
      ))}
    </div>
  )
}

// ---------- Gráfica 1 ----------

function GraficaFormaciones({ resumen }: { resumen: Resumen }) {
  const [metrica, setMetrica] = useState<ClaveMetrica>('yardasPorJugada')
  const datos = resumen.formaciones.map((f) => ({
    nombre: `${f.formacion} (${f.total.jugadas})`,
    total: f.total[metrica],
    conPA: f.conPA.jugadas ? f.conPA[metrica] : null,
    sinPA: f.sinPA.jugadas ? f.sinPA[metrica] : null,
  }))
  const pa = resumen.playAction
  const fmt = etiqueta(metrica)
  return (
    <Tarjeta titulo="1 · Rendimiento por formación ofensiva y Play Action" extra={<SelectorMetrica valor={metrica} onChange={setMetrica} />}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={fmt} />
              <Legend />
              <Bar dataKey="total" name="Total" fill={NEGRO} />
              <Bar dataKey="conPA" name="Con Play Action" fill={NARANJA} />
              <Bar dataKey="sinPA" name="Sin Play Action" fill={GRIS} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { nombre: `Con PA (${pa.con.jugadas})`, valor: pa.con[metrica] },
                { nombre: `Sin PA (${pa.sin.jugadas})`, valor: pa.sin[metrica] },
              ]}
              margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nombre" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={fmt} />
              <Bar dataKey="valor" name={METRICAS.find((m) => m.clave === metrica)!.nombre}>
                <Cell fill={NARANJA} /><Cell fill={GRIS} />
                <LabelList dataKey="valor" position="top" formatter={fmt} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">Entre paréntesis, jugadas por formación. JUMBO, I_FORM y PISTOL tienen menos de 5 jugadas.</p>
    </Tarjeta>
  )
}

// ---------- Gráfica 2 ----------

function GraficaDefensa({ resumen }: { resumen: Resumen }) {
  const [metrica, setMetrica] = useState<ClaveMetrica>('yardasPorJugada')
  const colores: Record<string, string> = {
    Blitz: NARANJA, 'Sin blitz': GRIS, Hombre: NARANJA, Zona: GRIS, 'Con presión': NARANJA, 'Sin presión': GRIS,
  }
  const datos = resumen.defensa.map((d) => ({ nombre: `${d.grupo} (${d.jugadas})`, grupo: d.grupo, valor: d[metrica] }))
  const fmt = etiqueta(metrica)
  return (
    <Tarjeta titulo="2 · Fortalezas de Burrow frente a la defensa" extra={<SelectorMetrica valor={metrica} onChange={setMetrica} />}>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmt} />
            <Tooltip formatter={fmt} />
            <Bar dataKey="valor" name={METRICAS.find((m) => m.clave === metrica)!.nombre}>
              {datos.map((d) => <Cell key={d.grupo} fill={colores[d.grupo]} />)}
              <LabelList dataKey="valor" position="top" formatter={fmt} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500">Pares: blitz vs. sin blitz, cobertura hombre vs. zona y, como referencia, con vs. sin presión.</p>
    </Tarjeta>
  )
}

// ---------- Gráfica 3 ----------

function GraficaTiempo({ resumen }: { resumen: Resumen }) {
  const porResultado = resumen.tttPorResultado.map((r) => ({
    nombre: `${RESULTADOS[r.resultado] ?? r.resultado} (${r.jugadas})`,
    resultado: r.resultado,
    promedio: r.promedio,
  }))
  const porTramo = resumen.tttPorTramo.map((t) => ({
    tramo: `${t.tramo} (${t.jugadas})`,
    yardas: t.yardasPorJugada,
    completos: t.pctCompletos == null ? null : t.pctCompletos * 100,
    sacks: t.tasaSacks == null ? null : t.tasaSacks * 100,
  }))
  const seg2 = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(2)} s` : '—')
  const pct0 = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(0)}%` : '—')
  return (
    <Tarjeta titulo='3 · El "punto dulce" del time to throw'>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Time to throw promedio según el resultado</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porResultado} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={seg2} />
                <Tooltip formatter={seg2} />
                <Bar dataKey="promedio" name="Promedio">
                  {porResultado.map((r) => <Cell key={r.resultado} fill={r.resultado === 'S' ? '#B91C1C' : r.resultado === 'C' ? NARANJA : GRIS} />)}
                  <LabelList dataKey="promedio" position="top" formatter={seg2} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Qué pasa según cuánto tarda en soltar</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porTramo} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tramo" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="pct" tickFormatter={pct0} domain={[0, 100]} />
                <YAxis yAxisId="yds" orientation="right" />
                <Tooltip formatter={(v: unknown, n: unknown) => (n === 'Yardas por jugada' && typeof v === 'number' ? v.toFixed(2) : pct0(v))} />
                <Legend />
                <Bar yAxisId="yds" dataKey="yardas" name="Yardas por jugada" fill={NEGRO} />
                <Line yAxisId="pct" dataKey="completos" name="% completos" stroke={NARANJA} strokeWidth={3} />
                <Line yAxisId="pct" dataKey="sacks" name="% sacks" stroke="#B91C1C" strokeWidth={3} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Tarjeta>
  )
}
