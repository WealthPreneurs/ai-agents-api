import pytest
import requests

import parcel_lookup
from app import app

LAYER = "https://gis.example.gov/arcgis/rest/services/Parcels/MapServer/0"

LAYER_INFO = {
    "name": "Tax Parcels",
    "fields": [
        {"name": "OBJECTID", "type": "esriFieldTypeOID"},
        {"name": "APN", "type": "esriFieldTypeString"},
        {"name": "Owner_Name", "type": "esriFieldTypeString"},
        {"name": "CALC_ACRES", "type": "esriFieldTypeDouble"},
        {"name": "TOTAL_VAL", "type": "esriFieldTypeDouble"},
    ],
}

FEATURE = {
    "attributes": {"OBJECTID": 7, "APN": "12-345-678", "Owner_Name": "JANE DOE",
                   "CALC_ACRES": 1.25, "TOTAL_VAL": 250000},
    "geometry": {"rings": [[[-84.1, 33.9], [-84.0, 33.9], [-84.0, 34.0], [-84.1, 33.9]]]},
}


class FakeResponse:
    def __init__(self, data, status=200, url=LAYER):
        self._data, self.status_code, self.url = data, status, url
        self.is_redirect, self.headers = False, {}

    def json(self):
        return self._data


@pytest.fixture
def fake_arcgis(monkeypatch):
    """Replaces requests.get with a fake county server; records the query params."""
    calls = []
    state = {"features": [FEATURE], "layer": LAYER_INFO}

    def fake_get(url, params=None, **kwargs):
        calls.append((url, params))
        if url.endswith("/query"):
            return FakeResponse({"features": state["features"]})
        return FakeResponse(state["layer"])

    monkeypatch.setattr(parcel_lookup.requests, "get", fake_get)
    monkeypatch.setattr(parcel_lookup, "_check_public_host", lambda url: None)
    parcel_lookup._field_cache.clear()
    return calls, state


def test_normalize_parcel_id():
    assert parcel_lookup.normalize_parcel_id(" 12-345.678 ") == "12345678"


def test_success_maps_fields_case_insensitively(fake_arcgis):
    calls, _ = fake_arcgis
    result = parcel_lookup.query_arcgis_parcel(LAYER + "/query", "12-345-678")
    assert result["status"] == "Success"
    assert result["owner"] == "JANE DOE"
    assert result["acreage"] == 1.25
    assert result["assessed_value"] == 250000
    assert result["zoning"] == "N/A"
    assert result["geometry"]["type"] == "Polygon"
    assert result["searched_fields"] == ["APN"]
    where = calls[-1][1]["where"]
    assert "'12-345-678'" in where and "'12345678'" in where
    assert calls[-1][1]["outSR"] == "4326"


def test_quotes_are_escaped(fake_arcgis):
    calls, _ = fake_arcgis
    parcel_lookup.query_arcgis_parcel(LAYER, "12' OR '1'='1")
    assert "'12'' OR ''1''=''1'" in calls[-1][1]["where"]


def test_not_found(fake_arcgis):
    _, state = fake_arcgis
    state["features"] = []
    assert parcel_lookup.query_arcgis_parcel(LAYER, "999")["status"] == "Not Found"


def test_unknown_id_field_lists_available_fields(fake_arcgis):
    _, state = fake_arcgis
    state["layer"] = {"name": "X", "fields": [{"name": "FOO", "type": "esriFieldTypeString"}]}
    result = parcel_lookup.query_arcgis_parcel(LAYER, "1")
    assert result["status"] == "Error" and "FOO" in result["message"]
    # Naming the field by hand (any case) makes the lookup run against it.
    result = parcel_lookup.query_arcgis_parcel(LAYER, "12-345-678", id_field="foo")
    assert result["status"] == "Success" and result["searched_fields"] == ["FOO"]


def test_arcgis_error_is_reported(fake_arcgis, monkeypatch):
    monkeypatch.setattr(parcel_lookup.requests, "get", lambda *a, **k: FakeResponse(
        {"error": {"code": 400, "message": "Invalid query", "details": ["bad field"]}}))
    result = parcel_lookup.query_arcgis_parcel(LAYER, "1")
    assert result["status"] == "Error" and "Invalid query" in result["message"]


def test_timeout_is_reported(fake_arcgis, monkeypatch):
    def boom(*a, **k):
        raise requests.Timeout()
    monkeypatch.setattr(parcel_lookup.requests, "get", boom)
    assert "too long" in parcel_lookup.query_arcgis_parcel(LAYER, "1")["message"]


@pytest.mark.parametrize("url", ["ftp://x/MapServer/0", "https://gis.example.gov/arcgis/rest/services",
                                 "not a url"])
def test_bad_urls_rejected(url):
    assert parcel_lookup.query_arcgis_parcel(url, "1")["status"] == "Error"


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "169.254.169.254", "10.0.0.5"])
def test_private_hosts_blocked(host):
    result = parcel_lookup.query_arcgis_parcel(f"http://{host}/arcgis/rest/services/P/MapServer/0", "1")
    assert result["status"] == "Error" and "not a public address" in result["message"]


def test_web_routes(fake_arcgis):
    client = app.test_client()
    assert client.get("/").status_code == 200
    assert client.get("/health").json == {"status": "ok"}
    res = client.post("/api/lookup", json={"gis_endpoint_url": LAYER, "parcel_id": "12-345-678"})
    assert res.status_code == 200 and res.json["owner"] == "JANE DOE"
    res = client.post("/api/lookup", json={"gis_endpoint_url": LAYER})
    assert res.status_code == 400 and res.json["status"] == "Error"
