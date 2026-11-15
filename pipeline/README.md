# Pipeline context

## Scope and purpose

`pipeline/` contains the data-production path:

1. **The event-data path**: downloads/processes monthly GLDAS and MERRA-2 NetCDF
   data, exports monthly event/control series and 1-degree global grids, then
   builds the web contract from available real outputs.

The web frontend consumes the output contract; analysis/presentation logic is
mostly in `web/src/lib`, not in the pipeline.

## Active end-to-end flow

### 1. Configuration and event definitions

- `common.py` defines paths, the fixed period **2001–2024** (`NT = 24`, `NM = 288`),
  event loading, geographic boxes, weighted box means, monthly JSON
  writing, and `SOURCES.csv` upserts.
- `events.yaml` is the source of truth for eight events. Each event has an
  event center/radius and a control center. `load_events()` derives:
  - `box`: latitude ± `r`, longitude ± `r / cos(latitude)`;
  - `ctrl_box`: the same calculation around the control center.
- `regions()` exposes each box as `{event_id}:E` and `{event_id}:C`.
- `SOURCES.csv` records provenance for produced variables.

### 2. Monthly environmental ingestion (`gldas.py`)

The existing `gldas.py` commands now ingest both monthly GLDAS and MERRA-2
data. The execution steps and command-line interface are unchanged.

Supported output variables:

- `sm`: `SoilMoi0_10cm_inst`, primary soil moisture, converted to m³/m³.
- `gldas_precip`: `Rainf_tavg`, verification precipitation converted to mm/month; it
  also supplies the global `precip` layer when no dedicated primary precipitation
  series is available.
- `lst`: `Tair_f_inst`, near-surface air temperature used by the app, converted K → °C.
- `tree`: MERRA-2 `GRN` (`greeness_fraction`), converted from fraction to percentage;
  this is the only variable taken from MERRA-2.

Commands:

```text
python gldas.py fetch [--via opendap|https] [--workers N] [--only YYYY-MM,...]
python gldas.py local DIR [--force]
python gldas.py aggregate
```

`fetch`:

- creates the list of missing months for 2001-01 through 2024-12;
- downloads GLDAS through Earthdata OPeNDAP by default, or full HTTPS NetCDF;
  MERRA-2 `GRN` is downloaded through its GES DISC HTTPS granule URL;
- MERRA-2 stream names are selected by period (`300` for 2001–2010, normally
  `400` from 2011 onward); if a 2011+ granule is unavailable under `400`, the
  downloader retries the `401` stream exception and records the successful URL;
- uses `EARTHDATA_TOKEN` or `~/.netrc` credentials;
- retries ordinary failures, stops on 401/403;
- serializes NetCDF processing behind a lock while downloads can run in parallel;
- immediately converts each downloaded file and deletes the raw files;
- writes an idempotent `pipeline/raw/gldas/monthly/YYYYMM.npz`.

`local` processes already downloaded `GLDAS_NOAH025_M.AYYYYMM.021.nc4` files
without deleting them. It is a GLDAS-only recovery path; MERRA-2 vegetation is
obtained by `fetch`.

For each monthly file, `process_file()`:

- enables NetCDF mask/scale handling;
- normalizes dimension order;
- validates expected source units and converts them;
- masks soil moisture ≥ 0.55 m³/m³ as glacier/ice;
- computes cosine(latitude)-weighted means for every event/control box;
- bins the 0.25-degree source grid into a 180×360 one-degree grid, requiring at
  least 8 of 16 source cells per destination cell;
- records values, valid-cell counts, input units, and source metadata.

The MERRA-2 file is processed by `process_merra_file()`:

- reads only `GRN`;
- validates the fraction range (0–1) and converts it to percentage;
- computes event/control means and a 1-degree global grid;
- uses a lower valid-cell threshold appropriate for the coarser MERRA-2 grid.

If MERRA-2 cannot be downloaded for a month after trying its stream candidates,
the GLDAS variables for that month are still saved. The next `fetch` run retries
the missing vegetation data because a month is not considered complete until its
`tree` output exists.

### 3. Monthly export (`gldas.py aggregate`)

The command loads all monthly `.npz` files into arrays, warns about missing
months and stale event boxes, and writes the monthly values directly. No
annual aggregation is performed; missing months remain `null`/`NaN`.

It writes, for each GLDAS and MERRA-2 output variable:

- `pipeline/out/series_<var>.json`: role, units, product/layer, `dates`, and
  monthly event/control series plus a representative count;
- `pipeline/out/grid_<var>.npz`: monthly global 1-degree grid and grid metadata.

It also upserts four provenance rows into `SOURCES.csv`.

### 4. Contract assembly (`build_events.py`)

`build_events.py` is the active bridge into `web/public/data/`.

For each contract variable (`tree`, `lst`, `sm`, `precip`):

- a matching `pipeline/out/series_<var>.json` with role `primary` supplies the
  real series;
- otherwise, unavailable values become `null` and the frontend displays a
  warning bubble when the missing resource is requested.

Verification-role series (`verify_*`, currently GLDAS precipitation and
verification-role products are placed under each event's `verify` object rather than replacing
the four UI variables.

For each event it writes `web/public/data/events/<id>.json` containing:

- event/control series for all four UI variables;
- verification series;
- nulls when data is missing.

It writes/updates `web/public/data/manifest.json` with event metadata, variables,
global layers, and `SOURCES.csv` rows. Real global grids are quantized into
little-endian int16 binary files using each variable's fixed quantization `q`;
missing values are `-32768`.

Typical current workflow:

```text
cd pipeline
python gldas.py fetch --only 2016-05 # smoke test credentials/download
python gldas.py fetch --workers 3
python gldas.py aggregate
python build_events.py
```

## Tests

- `test_gldas.py` tests unit conversion, antimeridian/cosine-weighted means,
  NetCDF processing, ice masking, annual minimum-month behavior, local ingest,
  aggregation, and provenance.
- `test_build_events.py` tests real series, missing-value null behavior,
  verification series, and real global-grid quantization.

## Important boundaries and caveats

- `build_events.py` has its own four-variable contract (`tree`, `lst`, `sm`,
  `precip`).
- GLDAS supplies `sm`, `lst` (near-surface air temperature), and
  `gldas_precip` (`Rainf_tavg`). `sm` and `lst` are primary UI variables;
  precipitation remains verification-only unless the dedicated precipitation
  source is unavailable.
- MERRA-2 supplies `tree` as the primary vegetation variable. It is a
  model/reanalysis greenness fraction, not MODIS tree-cover percentage.
- `events.yaml` geometry is coupled to cached monthly metadata. Changing an event
  box requires reprocessing affected months.
- `gldas.py` documents an OPeNDAP URL as the default and flags its DAP4 syntax as
  needing verification; HTTPS is the fallback.
- Raw downloads are intentionally not retained. The durable intermediate cache
  is the reduced monthly `.npz` data.
- The current checked-out worktree already has unrelated modifications in
  `pipeline/SOURCES.csv` and `web/package-lock.json`; this context analysis did
  not alter them.
