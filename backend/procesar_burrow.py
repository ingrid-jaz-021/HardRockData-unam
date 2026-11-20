"""Cruza plays, pffScoutingData y tracking para las jugadas de Joe Burrow.

Uso (desde la raíz del proyecto):
    .venv\\Scripts\\python.exe -m backend.procesar_burrow      (Windows)
    .venv/bin/python -m backend.procesar_burrow                (macOS/Linux)

Genera backend/datos/burrow_jugadas.csv. Los archivos de data/ solo se leen.
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
SALIDA = Path(__file__).resolve().parent / "datos" / "burrow_jugadas.csv"

BURROW_ID = 52409
FPS = 10
EVENTOS_SNAP = ["ball_snap", "autoevent_ballsnap"]
# Orden de preferencia para el momento en que termina la decisión del QB
EVENTOS_FIN = ["pass_forward", "autoevent_passforward", "qb_sack", "qb_strip_sack"]

COLUMNAS_PLAYS = [
    "gameId", "playId", "quarter", "down", "yardsToGo", "absoluteYardlineNumber",
    "passResult", "playResult", "offenseFormation", "personnelO", "dropBackType",
    "pff_playAction", "pff_passCoverage", "pff_passCoverageType", "playDescription",
]


def categoria_distancia(yardas: float) -> str:
    if yardas <= 3:
        return "Corto"
    if yardas <= 7:
        return "Medio"
    return "Largo"


def indicadores_pff(pff: pd.DataFrame, claves: pd.DataFrame) -> pd.DataFrame:
    """Presión (hit/hurry/sack de algún defensor) y blitz (>= 5 en Pass Rush)."""
    p = pff.merge(claves, on=["gameId", "playId"])
    p["presion_jugador"] = p[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).max(axis=1) > 0
    return (
        p.groupby(["gameId", "playId"])
        .agg(
            presion=("presion_jugador", "any"),
            pass_rushers=("pff_role", lambda r: int((r == "Pass Rush").sum())),
        )
        .reset_index()
        .assign(blitz=lambda d: d["pass_rushers"] >= 5)
    )


def time_to_throw(claves: pd.DataFrame) -> pd.DataFrame:
    """Segundos entre el snap y pass_forward/qb_sack, leyendo solo los partidos de Burrow.

    La columna `time` del tracking solo tiene precisión de segundos, así que el
    tiempo se calcula con frameId: el tracking va a 10 frames por segundo.
    """
    filas = []
    for game_id in sorted(claves["gameId"].unique()):
        archivo = DATA / "tracking" / f"tracking_{game_id}.csv"
        t = pd.read_csv(archivo, usecols=["gameId", "playId", "frameId", "event"])
        t = t[t["event"].isin(EVENTOS_SNAP + EVENTOS_FIN)]
        # El evento se repite en cada jugador del frame; basta una fila por frame
        t = t.drop_duplicates(["gameId", "playId", "frameId", "event"])
        filas.append(t.merge(claves, on=["gameId", "playId"]))
    ev = pd.concat(filas, ignore_index=True)

    def primer_evento(grupo: pd.DataFrame, eventos: list[str]):
        for e in eventos:
            m = grupo[grupo["event"] == e]
            if not m.empty:
                return int(m["frameId"].min()), e
        return None, None

    resultados = []
    for (g, p), grupo in ev.groupby(["gameId", "playId"]):
        f_snap, _ = primer_evento(grupo, EVENTOS_SNAP)
        f_fin, evento_fin = primer_evento(grupo, EVENTOS_FIN)
        ttt = (f_fin - f_snap) / FPS if f_snap is not None and f_fin is not None else np.nan
        resultados.append({"gameId": g, "playId": p, "timeToThrow": ttt, "eventoFin": evento_fin})
    return pd.DataFrame(resultados)


def construir_jugadas() -> pd.DataFrame:
    pff = pd.read_csv(DATA / "pffScoutingData.csv")
    claves = pff.loc[pff["nflId"] == BURROW_ID, ["gameId", "playId"]].drop_duplicates()

    plays = pd.read_csv(DATA / "plays.csv", usecols=COLUMNAS_PLAYS)
    df = claves.merge(plays, on=["gameId", "playId"], how="left")

    games = pd.read_csv(DATA / "games.csv", usecols=["gameId", "week"])
    df = df.merge(games, on="gameId", how="left")

    df = df.merge(indicadores_pff(pff, claves), on=["gameId", "playId"], how="left")
    df = df.merge(time_to_throw(claves), on=["gameId", "playId"], how="left")

    df["distancia"] = df["yardsToGo"].apply(categoria_distancia)
    df["playAction"] = df["pff_playAction"].fillna(0).astype(int) == 1
    df["offenseFormation"] = df["offenseFormation"].fillna("DESCONOCIDA")
    df["pff_passCoverageType"] = df["pff_passCoverageType"].fillna("Other")
    df["timeToThrow"] = df["timeToThrow"].round(2)
    return df.sort_values(["week", "gameId", "playId"]).reset_index(drop=True)


if __name__ == "__main__":
    jugadas = construir_jugadas()
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    jugadas.to_csv(SALIDA, index=False)
    print(f"Guardado {SALIDA.relative_to(RAIZ)}: {len(jugadas)} jugadas")
    print("Sin time to throw:", int(jugadas["timeToThrow"].isna().sum()))
    print(jugadas["passResult"].value_counts(dropna=False).to_dict())
