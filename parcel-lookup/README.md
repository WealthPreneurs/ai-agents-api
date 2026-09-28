# Parcel Lookup

A small web app for looking up a parcel on a county's public ArcGIS REST parcel
layer. Paste the layer URL and a parcel ID/APN. It shows the owner, site
address, acreage, zoning, land use, assessed value and legal description,
draws the parcel on a map, and lists every field the county publishes.

## Run it

```bash
cd parcel-lookup
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py            # http://localhost:5000
```

For production, use `gunicorn app:app --bind 0.0.0.0:$PORT`. The `Procfile`
already does this on Render, Railway and Heroku. Set the service's root
directory to `parcel-lookup/`.

## Finding a county's layer URL

Open the county's GIS "REST services" directory (usually
`https://<county-gis-host>/arcgis/rest/services`, or search
"<county> ArcGIS REST parcels"). Open the parcel service and click the parcel
layer. The URL you need ends in `/MapServer/<n>` or `/FeatureServer/<n>`.

## How the lookup works

`parcel_lookup.py` does the lookup and `app.py` is the web layer.

- It reads the layer's field list first. It then searches whichever of the
  common parcel-number fields exist (`PARCEL_ID`, `APN`, `PIN`, `PARCELNO`, …).
  If none match, enter the field name under **Parcel ID field**; the error
  message lists the fields the layer has.
- It matches the ID as typed and with punctuation removed, because counties
  store IDs both ways (`12-345-678` and `12345678`).
- It reads result fields case-insensitively and tries several common names for
  each (for example `ACRES`, `CALC_ACRES` and `GIS_ACRES`).
- It returns geometry in WGS84 (`outSR=4326`) so the map can draw it. It
  returns up to 10 matches.
- It reports ArcGIS errors, timeouts and non-JSON responses as clear
  messages. It does not report them as "Not Found".
- It only contacts public addresses, checking every redirect, so the server
  can't be used to reach your internal network. Set
  `PARCEL_ALLOW_PRIVATE_HOSTS=1` only for local testing against a GIS server on
  your LAN.

### API

`POST /api/lookup` with JSON `{"gis_endpoint_url": "...", "parcel_id": "...", "id_field": "optional"}`
returns `{"status": "Success" | "Not Found" | "Error", ...}`. The same call is
available in Python as `query_arcgis_parcel(url, parcel_id)`.

## Tests

```bash
pip install pytest && python -m pytest
```
