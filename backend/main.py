"""API del recomendador para Joe Burrow. Ejecuta: .venv/bin/uvicorn backend.main:app --reload"""
from typing import Literal

from fastapi import FastAPI

from backend.analisis import cargar_jugadas, recomendar, resumen

app = FastAPI(title="Hackathon NFL UNAM")

# Se calcula una vez al arrancar: 255 jugadas, cabe sin problema en memoria
JUGADAS = cargar_jugadas()
RESUMEN = resumen(JUGADAS)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/resumen")
def api_resumen() -> dict:
    return RESUMEN


@app.get("/api/recomendacion")
def api_recomendacion(
    down: Literal["Todos", "1st", "2nd", "3rd"] = "Todos",
    distancia: Literal["Todas", "Corto", "Medio", "Largo"] = "Todas",
) -> dict:
    return recomendar(JUGADAS, down, distancia)
