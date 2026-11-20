"""Métricas y recomendador de jugada para Joe Burrow."""
import math

import pandas as pd

from backend.procesar_burrow import SALIDA, construir_jugadas

INTENTOS = ["C", "I", "IN"]
RESULTADOS_TTT = ["C", "I", "S", "IN"]
TRAMOS_TTT = [(0.0, 2.5, "< 2.5 s"), (2.5, 3.0, "2.5–3.0 s"), (3.0, 3.5, "3.0–3.5 s"), (3.5, 99.0, "> 3.5 s")]
DOWNS = {"1st": 1, "2nd": 2, "3rd": 3}
# Puntaje = yardas/jugada + 5 × %completos − 10 × %sacks (porcentajes como fracción)
PESO_COMP, PESO_SACK = 5.0, 10.0


def cargar_jugadas() -> pd.DataFrame:
    """Usa el CSV procesado; si no existe, lo calcula en memoria (el servidor es efímero)."""
    if SALIDA.exists():
        return pd.read_csv(SALIDA)
    return construir_jugadas()


def _num(x, dec: int = 3):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), dec)


def metricas(df: pd.DataFrame) -> dict:
    n = len(df)
    intentos = df["passResult"].isin(INTENTOS).sum()
    comp = (df["passResult"] == "C").sum() / intentos if intentos else math.nan
    sacks = (df["passResult"] == "S").sum() / n if n else math.nan
    ypp = df["playResult"].mean() if n else math.nan
    return {
        "jugadas": int(n),
        "pctCompletos": _num(comp),
        "yardasPorJugada": _num(ypp, 2),
        "tasaSacks": _num(sacks),
        "timeToThrow": _num(df["timeToThrow"].mean(), 2),
        "puntaje": _num(puntaje(ypp, comp, sacks), 2),
    }


def puntaje(ypp: float, comp: float, sacks: float) -> float:
    if any(isinstance(v, float) and math.isnan(v) for v in (ypp, comp, sacks)):
        return math.nan
    return ypp + PESO_COMP * comp - PESO_SACK * sacks


def filtrar(df: pd.DataFrame, down: str, distancia: str) -> pd.DataFrame:
    if down in DOWNS:
        df = df[df["down"] == DOWNS[down]]
    if distancia != "Todas":
        df = df[df["distancia"] == distancia]
    return df


def muestra_minima(n: int) -> int:
    return max(5, round(0.1 * n))


def recomendar(df: pd.DataFrame, down: str, distancia: str) -> dict:
    sub = filtrar(df, down, distancia)
    base = {"down": down, "distancia": distancia, "situacion": metricas(sub)}
    if sub.empty:
        return {**base, "formacion": None, "avisos": ["No hay jugadas de Burrow en esta situación."]}

    avisos = []
    minimo = muestra_minima(len(sub))

    # 1) Formación con mejor puntaje entre las que tienen muestra suficiente
    formaciones = [
        {"formacion": f, **metricas(g)} for f, g in sub.groupby("offenseFormation")
    ]
    validas = [f for f in formaciones if f["jugadas"] >= minimo and f["puntaje"] is not None]
    if validas:
        mejor = max(validas, key=lambda f: f["puntaje"])
    else:
        mejor = max(formaciones, key=lambda f: f["jugadas"])
        avisos.append(f"Ninguna formación llega a {minimo} jugadas; se muestra la más usada.")
    if mejor["jugadas"] < 15:
        avisos.append(f"La formación recomendada solo tiene {mejor['jugadas']} jugadas: tómala como indicio, no como regla.")
    formaciones.sort(key=lambda f: (f["puntaje"] is None, -(f["puntaje"] or 0)))

    # 2) Play Action: dentro de la formación elegida y, si no alcanza, en toda la situación
    sub_form = sub[sub["offenseFormation"] == mejor["formacion"]]
    play_action = comparar_play_action(sub_form, min_grupo=3)
    if play_action["usarPlayAction"] is None:
        play_action = comparar_play_action(sub, min_grupo=3)
        play_action["ambito"] = "situación completa"
    else:
        play_action["ambito"] = f"formación {mejor['formacion']}"
    if play_action["usarPlayAction"] is None:
        avisos.append("Muy pocas jugadas con Play Action para comparar en esta situación.")

    # 3) Tiempo objetivo: tramo de time to throw con mejor puntaje
    tiempo = tiempo_objetivo(sub, df)
    if tiempo["ambito"] != "situación":
        avisos.append("Pocas jugadas por tramo de tiempo; el tiempo objetivo usa las 255 jugadas.")

    return {
        **base,
        "muestraMinima": minimo,
        "formacion": mejor,
        "formaciones": formaciones,
        "playAction": play_action,
        "tiempoObjetivo": tiempo,
        "avisos": avisos,
    }


def comparar_play_action(df: pd.DataFrame, min_grupo: int) -> dict:
    con, sin = metricas(df[df["playAction"]]), metricas(df[~df["playAction"]])
    usar = None
    if con["jugadas"] >= min_grupo and sin["jugadas"] >= min_grupo and None not in (con["puntaje"], sin["puntaje"]):
        usar = con["puntaje"] > sin["puntaje"]
    return {"usarPlayAction": usar, "con": con, "sin": sin}


def por_tramo_ttt(df: pd.DataFrame) -> list[dict]:
    filas = []
    for lo, hi, etiqueta in TRAMOS_TTT:
        g = df[(df["timeToThrow"] >= lo) & (df["timeToThrow"] < hi)]
        filas.append({"tramo": etiqueta, "desde": lo, "hasta": hi, **metricas(g)})
    return filas


def tiempo_objetivo(sub: pd.DataFrame, todas: pd.DataFrame) -> dict:
    ambito, tramos = "situación", por_tramo_ttt(sub)
    validos = [t for t in tramos if t["jugadas"] >= 5 and t["puntaje"] is not None]
    if not validos:
        ambito, tramos = "todas las jugadas", por_tramo_ttt(todas)
        validos = [t for t in tramos if t["jugadas"] >= 5 and t["puntaje"] is not None]
    mejor = max(validos, key=lambda t: t["puntaje"])
    completos = sub.loc[sub["passResult"] == "C", "timeToThrow"]
    return {
        "ambito": ambito,
        "tramo": mejor,
        "medianaCompletos": _num(completos.median(), 2),
        "tramos": tramos,
    }


def resumen(df: pd.DataFrame) -> dict:
    formaciones = []
    for f, g in df.groupby("offenseFormation"):
        formaciones.append({
            "formacion": f,
            "total": metricas(g),
            "conPA": metricas(g[g["playAction"]]),
            "sinPA": metricas(g[~g["playAction"]]),
        })
    formaciones.sort(key=lambda f: -f["total"]["jugadas"])

    defensa = [
        {"grupo": "Blitz", **metricas(df[df["blitz"]])},
        {"grupo": "Sin blitz", **metricas(df[~df["blitz"]])},
        {"grupo": "Hombre", **metricas(df[df["pff_passCoverageType"] == "Man"])},
        {"grupo": "Zona", **metricas(df[df["pff_passCoverageType"] == "Zone"])},
        {"grupo": "Con presión", **metricas(df[df["presion"]])},
        {"grupo": "Sin presión", **metricas(df[~df["presion"]])},
    ]

    ttt_resultado = []
    for r in RESULTADOS_TTT:
        g = df.loc[df["passResult"] == r, "timeToThrow"].dropna()
        ttt_resultado.append({
            "resultado": r,
            "jugadas": int(len(g)),
            "promedio": _num(g.mean(), 2),
            "mediana": _num(g.median(), 2),
        })

    return {
        "kpis": metricas(df),
        "playAction": comparar_play_action(df, min_grupo=1),
        "formaciones": formaciones,
        "defensa": defensa,
        "tttPorResultado": ttt_resultado,
        "tttPorTramo": por_tramo_ttt(df),
        "pesos": {"completos": PESO_COMP, "sacks": PESO_SACK},
    }
