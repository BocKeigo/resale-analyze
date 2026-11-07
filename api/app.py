import os
from datetime import datetime
from urllib.parse import urlsplit

import psycopg
from flask import Flask, jsonify, request
from psycopg.rows import dict_row

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024
CATEGORIES = {"ゲーム", "トレカ", "フィギュア", "書籍・漫画", "限定品"}


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def product_rows(db, product_id=None):
    rows = db.execute("""
        SELECT p.id, p.name, p.category, p.edition, p.retail, p.evidence,
               p.official_url AS "officialUrl", p.image_url AS "imageUrl", 'manual' AS source,
               json_agg(json_build_object(
                   'price', s.price, 'shipping', s.shipping, 'cost', s.cost,
                   'confirmedAt', s.confirmed_at, 'soldAt', coalesce(s.sold_at::text, ''),
                   'listingUrl', coalesce(s.listing_url, '')
               ) ORDER BY coalesce(s.sold_at, s.confirmed_at) DESC, s.id DESC) AS sales
        FROM products p JOIN sales s ON s.product_id = p.id
        WHERE (%(id)s::bigint IS NULL OR p.id = %(id)s::bigint)
        GROUP BY p.id ORDER BY p.id
    """, {"id": product_id}).fetchall()
    return rows


def field(data, key, required=True, limit=300):
    value = data.get(key, "")
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError(f"{key} を確認してください。")
    return value.strip()


def url(data, key):
    value = field(data, key, required=False, limit=2048)
    if value:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username is not None:
            raise ValueError(f"{key} は HTTP(S) のURLを入力してください。")
    return value


def integer(data, key, minimum=0, optional=False):
    value = data.get(key)
    if value is None and optional:
        return None
    if type(value) is not int or not minimum <= value <= 100_000_000:
        raise ValueError(f"{key} の数値を確認してください。")
    return value


def timestamp(data, key, required=True):
    value = field(data, key, required=required, limit=40)
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.utcoffset() is None:
        raise ValueError(f"{key} にタイムゾーンを指定してください。")
    return parsed


@app.get("/api/health")
def health():
    with connect() as db:
        db.execute("SELECT 1 FROM sales LIMIT 1")
    return {"status": "ok"}


@app.get("/api/products")
def products():
    with connect() as db:
        return jsonify(product_rows(db))


@app.post("/api/products")
def add_sale():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get("sold") is not True or not isinstance(data.get("sale"), dict):
        return {"error": "売却済みの記録を入力してください。"}, 400
    sale = data["sale"]
    try:
        confirmed_at = timestamp(sale, "confirmedAt")
        sold_at = timestamp(sale, "soldAt", required=False)
        if sold_at and sold_at > confirmed_at:
            raise ValueError("売却日時は売却確認日時以前にしてください。")
        sale_values = (
            integer(sale, "price", 1), confirmed_at, sold_at,
            url(sale, "listingUrl") or None, integer(sale, "shipping"),
            integer(sale, "cost", optional=True),
        )
        product_id = data.get("productId")
        with connect() as db:
            if product_id is None:
                product = data.get("product")
                if not isinstance(product, dict):
                    raise ValueError("商品情報を入力してください。")
                category = field(product, "category")
                if category not in CATEGORIES:
                    raise ValueError("カテゴリを選択してください。")
                product_id = db.execute("""
                    INSERT INTO products (name, category, edition, retail, evidence, official_url, image_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (field(product, "name"), category, field(product, "edition", required=False),
                      integer(product, "retail", 1), field(product, "evidence"),
                      url(product, "officialUrl"), url(product, "imageUrl"))).fetchone()["id"]
            elif type(product_id) is not int or not 0 < product_id <= 2**63 - 1:
                raise ValueError("登録先の商品を確認してください。")
            db.execute("""
                INSERT INTO sales (product_id, price, confirmed_at, sold_at, listing_url, shipping, cost)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (product_id, *sale_values))
            result = product_rows(db, product_id)[0]
        return result, 201
    except ValueError as exc:
        return {"error": str(exc)}, 400
    except psycopg.errors.UniqueViolation:
        return {"error": "同じ取引URLが登録済みです。"}, 409
    except psycopg.errors.ForeignKeyViolation:
        return {"error": "登録先の商品が見つかりません。"}, 404
