CREATE TABLE products (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL CHECK (category IN ('ゲーム','トレカ','フィギュア','書籍・漫画','限定品')),
    edition text NOT NULL DEFAULT '',
    retail integer NOT NULL CHECK (retail > 0),
    evidence text NOT NULL,
    official_url text NOT NULL DEFAULT ''
);
CREATE TABLE sales (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id integer NOT NULL REFERENCES products(id),
    price integer NOT NULL CHECK (price > 0),
    confirmed_at timestamptz NOT NULL,
    sold_at timestamptz CHECK (sold_at <= confirmed_at),
    listing_url text UNIQUE,
    shipping integer NOT NULL CHECK (shipping >= 0),
    cost integer CHECK (cost >= 0)
);
CREATE INDEX sales_product_id ON sales(product_id);
