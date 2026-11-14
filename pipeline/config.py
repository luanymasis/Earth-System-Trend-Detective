"""Catálogo de variables, grilla y período (PLAN §3).

Los short names y nombres de variable de NASA deben verificarse en Earthdata Search
antes de descargar (PLAN §11.1). Los marcados TODO(verificar) aún no se han revisado.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DATA_OUT = REPO / "web" / "public" / "data"
ASSETS = ROOT / "assets"

YEARS = (2001, 2024)
RES = 2  # grados

# domain: clave de máscara usada por el pipeline
#   all        -> todo el globo
#   land       -> cualquier celda con algo de tierra (incluye Antártida)
#   land_core  -> tierra sin Antártida (lat > -60) ni Groenlandia
#   ocean      -> océano, |lat| < 75
#   snow       -> tierra con lat > 36
# clip: recorte de la capa en el globo (all | land | ocean)
VARIABLES = [
    dict(id="precip", short="Lluvia", q="¿Está lloviendo más o menos?",
         noun="la lluvia", up="llueve más", down="llueve menos",
         low="Menos lluvia", high="Más lluvia",
         units="mm/mes", mode="pct", fdec=0, dec=2, domain="all", clip="all",
         palette="BrBG", vmax=6, source="Reanálisis",
         product="MERRA-2 M2TMNXFLX", short_name="M2TMNXFLX", varname="PRECTOT",
         doi_or_url="TODO(verificar)"),
    dict(id="t2m", short="Temperatura", q="¿Hace más calor que antes?",
         noun="la temperatura", up="hace más calor", down="hace menos calor",
         low="Más frío", high="Más calor",
         units="°C", mode="abs", fdec=1, dec=2, domain="land", clip="land",
         palette="RdBu", vmax=0.8, source="Reanálisis",
         product="MERRA-2 M2TMNXSLV", short_name="M2TMNXSLV", varname="T2M",
         doi_or_url="TODO(verificar)"),
    dict(id="sst", short="Mar", q="¿Se está calentando el mar?",
         noun="la temperatura del mar", up="el mar está más cálido", down="el mar está más frío",
         low="Mar más frío", high="Mar más cálido",
         units="°C", mode="abs", fdec=2, dec=3, domain="ocean", clip="ocean",
         palette="RdBu", vmax=0.5, source="Reanálisis",
         product="MERRA-2 M2TMNXSLV (TS sobre océano)", short_name="M2TMNXSLV", varname="TS",
         doi_or_url="TODO(verificar)"),
    dict(id="snow", short="Nieve", q="¿Hay menos nieve?",
         noun="la nieve", up="hay más nieve", down="hay menos nieve",
         low="Menos nieve", high="Más nieve",
         units="% de cobertura", mode="pct", fdec=0, dec=2, domain="snow", clip="land",
         palette="PuOr", vmax=6, source="Reanálisis",
         product="MERRA-2 M2TMNXLND", short_name="M2TMNXLND", varname="FRSNO",
         doi_or_url="TODO(verificar)"),
    dict(id="ndvi", short="Vegetación", q="¿Hay más o menos vegetación?",
         noun="el verdor de la vegetación", up="hay más vegetación", down="hay menos vegetación",
         low="Menos verde", high="Más verde",
         units="NDVI", mode="pct", fdec=3, dec=4, domain="land_core", clip="land",
         palette="BrBG", vmax=0.03, source="Satélite",
         product="MODIS Terra MOD13C2", short_name="MOD13C2", varname="CMG 0.05 Deg Monthly NDVI",
         doi_or_url="TODO(verificar)"),
    dict(id="sm", short="Humedad del suelo", q="¿Se está secando el suelo?",
         noun="la humedad del suelo", up="el suelo está más húmedo", down="el suelo está más seco",
         low="Suelo más seco", high="Suelo más húmedo",
         units="m³/m³", mode="pct", fdec=3, dec=4, domain="land_core", clip="land",
         palette="BrBG", vmax=0.012, source="Modelo",
         product="GLDAS Noah GLDAS_NOAH10_M", short_name="GLDAS_NOAH10_M", varname="SoilMoi0_10cm_inst",
         doi_or_url="TODO(verificar)"),
    dict(id="aod", short="Partículas en el aire", q="¿El aire está más limpio?",
         noun="la cantidad de partículas en el aire", up="hay más partículas en el aire",
         down="el aire está más limpio", low="Aire más limpio", high="Más partículas",
         units="AOD", mode="pct", fdec=3, dec=3, domain="all", clip="all",
         palette="GnPi", vmax=0.05, source="Reanálisis",
         product="MERRA-2 M2TMNXAER", short_name="M2TMNXAER", varname="TOTEXTTAU",
         doi_or_url="TODO(verificar)"),
]

# Campos que viajan al manifest (el resto es interno del pipeline)
MANIFEST_FIELDS = ["id", "short", "q", "noun", "up", "down", "low", "high", "units", "mode",
                   "fdec", "dec", "domain", "clip", "palette", "vmax", "product", "source",
                   "doi_or_url"]

ALPHA = 0.05
