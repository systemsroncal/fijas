# Diseño: Análisis IA híbrido (partido / combinada / aleatorio)

Fecha: 2026-07-13  
Proyecto: Fijas (WPS Admin)

## Objetivo

Ofrecer análisis por **partido**, **combinada** y **scanner aleatorio**, con dashboard exportable a PNG y motor híbrido:

1. **Modelo** Poisson + edge/Kelly (patrones tipo penaltyblog / market scanners).
2. **LLM** para enriquecer props (tiros, goleador, córners avanzados) marcados `estimated`.

## Fuera de alcance

- Pipelines NBA (XGBoost/TF).
- Infografías fotorealistas generadas por IA.
- Garantía de rentabilidad.

## Modos API `POST /api/analyses`

| mode | Input | Salida |
|------|--------|--------|
| `MATCH` | `matchId` | `payload` dashboard + Analysis |
| `ACCUMULATOR` | `accumulatorId` o `suggestedId` | risk/EV/stake + payload resumen |
| `RANDOM` | (partidos del día) | scanner de huecos + combinadas propuestas |

## Persistencia

`Analysis`: `mode`, `matchId?`, `accumulatorId?`, `payload` Json.

## UI

- Toggle en `/analyses`.
- `MatchAnalysisDashboard` + Exportar PNG (`html-to-image`).

## Disclaimer

Todo análisis incluye aviso: no es consejo financiero; props LLM son estimados.
