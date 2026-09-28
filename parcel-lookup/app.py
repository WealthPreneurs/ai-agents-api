"""Parcel Lookup web app: a form in front of query_arcgis_parcel."""

import os

from flask import Flask, jsonify, render_template, request

from parcel_lookup import query_arcgis_parcel

app = Flask(__name__)

# Local development only: lets the app query GIS servers on private networks.
ALLOW_PRIVATE_HOSTS = os.environ.get("PARCEL_ALLOW_PRIVATE_HOSTS") == "1"


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/api/lookup")
def lookup():
    body = request.get_json(silent=True) or {}
    result = query_arcgis_parcel(
        body.get("gis_endpoint_url", ""),
        body.get("parcel_id", ""),
        id_field=body.get("id_field") or None,
        allow_private=ALLOW_PRIVATE_HOSTS,
    )
    code = 200 if result["status"] != "Error" else 400
    return jsonify(result), code


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
