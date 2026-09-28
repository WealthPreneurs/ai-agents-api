"""Looks up parcels on a county's ArcGIS REST feature layer."""

import ipaddress
import re
import socket
import time
from urllib.parse import urljoin, urlparse

import requests

TIMEOUT_SECONDS = 15
MAX_REDIRECTS = 3
MAX_FEATURES = 10
FIELD_CACHE_SECONDS = 600

# Field names counties commonly use for the parcel number, in order of preference.
ID_FIELD_CANDIDATES = [
    "PARCEL_ID", "PARCELID", "PARCEL_NUM", "PARCELNUM", "PARCEL_NO", "PARCELNO",
    "PARCELNUMBER", "PARCEL_NUMBER", "APN", "PIN", "PARCEL", "PARCEL_PIN",
    "PARID", "PID", "TAX_ID", "TAXID", "ACCOUNT", "ACCT_NUM", "FOLIO",
]

# Output field -> attribute names to try, in order.
ATTRIBUTE_CANDIDATES = {
    "owner": ["OWNER", "OWNER_NAME", "OWNERNAME", "OWNER1", "OWN_NAME", "OWNERNME1"],
    "address": ["SITE_ADDR", "SITEADDR", "SITUS", "SITUS_ADDR", "SITUSADDR",
                "PROP_ADDR", "PROPERTY_ADDRESS", "ADDRESS", "FULL_ADDR", "FULLADDR"],
    "legal_description": ["LEGAL_DESC", "LEGALDESC", "LEGAL", "LEGAL_DESCRIPTION", "LGL_DESC"],
    "acreage": ["ACRES", "CALC_ACRES", "CALCACRES", "GIS_ACRES", "DEED_ACRES",
                "ACREAGE", "TOTAL_ACRES", "LAND_ACRES"],
    "zoning": ["ZONING", "ZONE", "ZONE_CODE", "ZONING_CODE", "ZONECLASS"],
    "land_use": ["LAND_USE", "LANDUSE", "USE_CODE", "USECODE", "PROP_CLASS",
                 "PROPCLASS", "CLASS", "USEDESC", "LAND_USE_DESC"],
    "assessed_value": ["TOTAL_VAL", "TOTALVAL", "TOTAL_VALUE", "ASSESSED_VALUE",
                       "ASSD_VAL", "ASSESSED", "MARKET_VALUE", "APPRAISED_VALUE",
                       "TOT_APPR", "CNTASSDVAL"],
}

STRING_FIELD_TYPES = {"esriFieldTypeString", "esriFieldTypeGUID", "esriFieldTypeGlobalID"}
NUMBER_FIELD_TYPES = {
    "esriFieldTypeInteger", "esriFieldTypeSmallInteger", "esriFieldTypeBigInteger",
    "esriFieldTypeDouble", "esriFieldTypeSingle", "esriFieldTypeOID",
}

_field_cache = {}


class ParcelLookupError(Exception):
    """A problem the user can fix (bad URL, unknown field, county server error)."""


def normalize_parcel_id(raw_id):
    """Cleans and standardizes parcel identification numbers."""
    return re.sub(r"[^a-zA-Z0-9]", "", raw_id)


def normalize_layer_url(url):
    """Returns the layer URL without a trailing /query or slash, or raises ParcelLookupError."""
    url = (url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ParcelLookupError("Enter the full http(s) URL of the county's ArcGIS parcel layer.")
    url = url.split("?", 1)[0].rstrip("/")
    if url.lower().endswith("/query"):
        url = url[: -len("/query")]
    if not re.search(r"/(FeatureServer|MapServer)/\d+$", url, re.IGNORECASE):
        raise ParcelLookupError(
            "The URL must point at a single layer and end in /FeatureServer/<n> or "
            "/MapServer/<n>, e.g. https://gis.example.gov/arcgis/rest/services/Parcels/MapServer/0"
        )
    return url


def _check_public_host(url):
    """Blocks requests to private, loopback and link-local addresses."""
    host = urlparse(url).hostname
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ParcelLookupError(f"Could not find the server {host}. Check the URL.")
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise ParcelLookupError(f"{host} is not a public address.")


def _get_json(url, params, allow_private=False):
    """GETs an ArcGIS REST URL, checking every redirect hop, and returns the JSON body."""
    for _ in range(MAX_REDIRECTS + 1):
        if not allow_private:
            _check_public_host(url)
        try:
            response = requests.get(url, params=params, timeout=TIMEOUT_SECONDS,
                                    allow_redirects=False)
        except requests.Timeout:
            raise ParcelLookupError("The county server took too long to respond.")
        except requests.RequestException as exc:
            raise ParcelLookupError(f"Could not reach the county server: {exc}")
        if response.is_redirect:
            url = urljoin(response.url, response.headers["Location"])
            continue
        if response.status_code >= 400:
            raise ParcelLookupError(f"The county server returned HTTP {response.status_code}.")
        try:
            data = response.json()
        except ValueError:
            raise ParcelLookupError("The county server did not return JSON. Is this an ArcGIS REST layer URL?")
        if isinstance(data, dict) and "error" in data:
            error = data["error"]
            details = "; ".join(d for d in error.get("details") or [] if d)
            message = error.get("message") or "Unknown error"
            raise ParcelLookupError(f"ArcGIS error: {message}" + (f" ({details})" if details else ""))
        return data
    raise ParcelLookupError("The county server redirected too many times.")


def get_layer_info(layer_url, allow_private=False):
    """Returns the layer's name and fields, cached for a few minutes."""
    cached = _field_cache.get(layer_url)
    if cached and time.time() - cached[0] < FIELD_CACHE_SECONDS:
        return cached[1]
    data = _get_json(layer_url, {"f": "json"}, allow_private)
    fields = data.get("fields")
    if not fields:
        raise ParcelLookupError("That URL is not a feature layer with fields. Pick a numbered layer "
                          "(…/MapServer/0), not a folder or service.")
    info = {"name": data.get("name", ""), "fields": fields}
    _field_cache[layer_url] = (time.time(), info)
    return info


def _find_field(fields, candidates):
    by_upper = {f["name"].upper(): f for f in fields}
    for name in candidates:
        if name in by_upper:
            return by_upper[name]
    return None


def _sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def build_where(id_fields, parcel_id):
    """Builds a WHERE clause matching the ID as typed and with punctuation removed."""
    cleaned = normalize_parcel_id(parcel_id)
    typed = parcel_id.strip()
    clauses = []
    for field in id_fields:
        name = field["name"]
        if field.get("type") in NUMBER_FIELD_TYPES:
            if cleaned.isdigit():
                clauses.append(f"{name} = {int(cleaned)}")
            continue
        values = {typed, cleaned, typed.upper(), cleaned.upper()}
        clauses.append(f"{name} IN ({', '.join(_sql_literal(v) for v in sorted(values))})")
    return " OR ".join(clauses)


def _pick(attributes, candidates):
    by_upper = {k.upper(): v for k, v in attributes.items()}
    for name in candidates:
        value = by_upper.get(name)
        if value not in (None, "", " "):
            return value
    return None


def _to_geojson(geometry):
    if not geometry:
        return None
    if "rings" in geometry:
        return {"type": "Polygon", "coordinates": geometry["rings"]}
    if "x" in geometry and "y" in geometry:
        return {"type": "Point", "coordinates": [geometry["x"], geometry["y"]]}
    if "paths" in geometry:
        return {"type": "MultiLineString", "coordinates": geometry["paths"]}
    return None


def summarize_feature(feature, parcel_id):
    attributes = feature.get("attributes") or {}
    summary = {"parcel_id": parcel_id}
    for key, candidates in ATTRIBUTE_CANDIDATES.items():
        value = _pick(attributes, candidates)
        summary[key] = "N/A" if value is None else value
    summary["attributes"] = attributes
    summary["geometry"] = _to_geojson(feature.get("geometry"))
    return summary


def query_arcgis_parcel(gis_endpoint_url, parcel_id, id_field=None, allow_private=False):
    """
    Queries a county's ArcGIS REST API endpoint for parcel details.

    Returns {"status": "Success" | "Not Found" | "Error", ...}.
    """
    parcel_id = (parcel_id or "").strip()
    try:
        if not normalize_parcel_id(parcel_id):
            raise ParcelLookupError("Enter a parcel ID.")
        layer_url = normalize_layer_url(gis_endpoint_url)
        layer = get_layer_info(layer_url, allow_private)
        fields = layer["fields"]

        if id_field:
            match = _find_field(fields, [id_field.strip().upper()])
            if not match:
                raise ParcelLookupError(f"The layer has no field named {id_field}.")
            id_fields = [match]
        else:
            by_upper = {f["name"].upper(): f for f in fields}
            id_fields = [by_upper[n] for n in ID_FIELD_CANDIDATES if n in by_upper]
            id_fields = [f for f in id_fields
                         if f.get("type") in STRING_FIELD_TYPES | NUMBER_FIELD_TYPES]
            if not id_fields:
                raise ParcelLookupError(
                    "Couldn't tell which field holds the parcel number. Enter it under "
                    "'Parcel ID field'. Available fields: "
                    + ", ".join(f["name"] for f in fields)
                )

        where = build_where(id_fields, parcel_id)
        if not where:
            return {"status": "Not Found", "parcel_id": parcel_id,
                    "message": "That ID can't match the layer's numeric parcel field."}

        data = _get_json(f"{layer_url}/query", {
            "where": where,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": MAX_FEATURES,
            "f": "json",
        }, allow_private)

        features = data.get("features") or []
        if not features:
            return {"status": "Not Found", "parcel_id": parcel_id,
                    "layer": layer["name"], "searched_fields": [f["name"] for f in id_fields]}

        results = [summarize_feature(f, parcel_id) for f in features]
        return {
            "status": "Success",
            "layer": layer["name"],
            "searched_fields": [f["name"] for f in id_fields],
            "match_count": len(results),
            **results[0],
            "matches": results,
        }
    except ParcelLookupError as exc:
        return {"status": "Error", "parcel_id": parcel_id, "message": str(exc)}
    except Exception as exc:  # keep the web app up on anything unexpected
        return {"status": "Error", "parcel_id": parcel_id, "message": f"Unexpected error: {exc}"}
