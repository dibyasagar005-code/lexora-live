"""
Market data API integration for LexorA.
Yahoo Finance + CoinGecko + Frankfurter with price validation.
"""

import requests
from datetime import datetime

TIMEOUT = 12
TROY_OZ_GRAMS = 31.1034768

PRICE_RANGES = {
    "gold": (1500, 6500),
    "silver": (12, 120),
    "platinum": (700, 3500),
    "palladium": (800, 6000),
    "copper": (2, 15),
    "bitcoin": (10000, 250000),
    "ethereum": (500, 25000),
    "crude_oil": (35, 200),
    "sp500": (3000, 9000),
    "nasdaq": (10000, 35000),
    "usd_inr": (70, 110),
    "eur_usd": (0.85, 1.25),
    "gbp_usd": (1.0, 1.45),
}

FALLBACK_PRICES = {
    "gold": 3340.0,
    "silver": 31.2,
    "platinum": 1020.0,
    "palladium": 980.0,
    "copper": 4.25,
    "bitcoin": 97000.0,
    "ethereum": 3600.0,
    "crude_oil": 72.0,
    "usd_inr": 83.5,
    "sp500": 5900.0,
    "nasdaq": 19500.0,
    "eur_usd": 1.08,
    "gbp_usd": 1.27,
}

YAHOO_TICKERS = {
    "gold": "GC=F",
    "silver": "SI=F",
    "platinum": "PL=F",
    "palladium": "PA=F",
    "copper": "HG=F",
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "crude_oil": "CL=F",
    "sp500": "^GSPC",
    "nasdaq": "^IXIC",
}

YAHOO_ALT = {
    "gold": ["XAUUSD=X", "GC=F"],
    "silver": ["XAGUSD=X", "SI=F"],
}


def _valid_price(key, price):
    bounds = PRICE_RANGES.get(key)
    if not bounds:
        return price > 0
    return bounds[0] <= price <= bounds[1]


def _safe_request(url, params=None):
    try:
        resp = requests.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[API] {url}: {e}")
        return None


def fetch_yahoo_ticker(ticker, key):
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        hist = stock.history(period="5d")
        if hist.empty:
            return None
        price = float(hist["Close"].iloc[-1])
        if not _valid_price(key, price):
            return None
        prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price
        change = ((price - prev) / prev) * 100 if prev else 0
        unit = "oz" if key in ("gold", "silver", "platinum", "palladium") else "lb" if key == "copper" else "unit"
        return {"price": round(price, 4), "change": round(change, 2), "symbol": key.upper(), "unit": unit}
    except Exception:
        return None


def fetch_yahoo_asset(key):
    tickers = [YAHOO_TICKERS.get(key)] + YAHOO_ALT.get(key, [])
    for t in dict.fromkeys(tickers):
        if not t:
            continue
        data = fetch_yahoo_ticker(t, key)
        if data:
            return data
    return None


def fetch_goldprice_org():
    """Global gold/silver spot (USD per troy oz)."""
    out = {}
    result = _safe_request("https://data-asg.goldprice.org/dbXRates/USD")
    if not result:
        return out
    item = (result.get("items") or [None])[0] or result
    if item.get("xauPrice") and _valid_price("gold", item["xauPrice"]):
        out["gold"] = {
            "price": float(item["xauPrice"]),
            "change": float(item.get("chgXau") or item.get("chgXAU") or 0),
            "symbol": "GOLD",
            "unit": "oz",
            "live": True,
            "apiSource": "goldprice.org",
        }
    if item.get("xagPrice") and _valid_price("silver", item["xagPrice"]):
        out["silver"] = {
            "price": float(item["xagPrice"]),
            "change": float(item.get("chgXag") or item.get("chgXAG") or 0),
            "symbol": "SILVER",
            "unit": "oz",
            "live": True,
            "apiSource": "goldprice.org",
        }
    return out


def fetch_gold_api_spot(metal="XAU", key="gold"):
    result = _safe_request(f"https://api.gold-api.com/price/{metal}")
    if not result:
        return None
    price = float(result.get("price") or result.get("metalPrice") or 0)
    if not _valid_price(key, price):
        return None
    return {
        "price": price,
        "change": float(result.get("chg") or result.get("change") or 0),
        "symbol": key.upper(),
        "unit": "oz",
        "live": True,
        "apiSource": "gold-api.com",
    }


def fetch_yahoo_assets():
    data = fetch_goldprice_org()
    for key in YAHOO_TICKERS:
        if key in data and _valid_price(key, data[key]["price"]):
            continue
        row = fetch_yahoo_asset(key)
        if row:
            row["live"] = True
            row["apiSource"] = "yahoo"
            data[key] = row
    if "gold" not in data:
        api_gold = fetch_gold_api_spot("XAU", "gold")
        if api_gold:
            data["gold"] = api_gold
    if "silver" not in data:
        api_silver = fetch_gold_api_spot("XAG", "silver")
        if api_silver:
            data["silver"] = api_silver
    return data


def fetch_crypto_binance():
    data = {}
    pairs = {"bitcoin": "BTCUSDT", "ethereum": "ETHUSDT"}
    for key, sym in pairs.items():
        result = _safe_request(f"https://api.binance.com/api/v3/ticker/24hr?symbol={sym}")
        if not result:
            continue
        price = float(result.get("lastPrice", 0))
        if _valid_price(key, price):
            data[key] = {
                "price": price,
                "change": float(result.get("priceChangePercent", 0)),
                "unit": "unit",
                "live": True,
                "apiSource": "binance",
            }
    return data


def fetch_coingecko():
    data = {}
    result = _safe_request(
        "https://api.coingecko.com/api/v3/simple/price",
        params={
            "ids": "bitcoin,ethereum",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
        },
    )
    if result:
        if "bitcoin" in result:
            data["bitcoin"] = {
                "price": result["bitcoin"]["usd"],
                "change": result["bitcoin"].get("usd_24h_change", 0),
                "unit": "unit",
                "live": True,
                "apiSource": "coingecko",
            }
        if "ethereum" in result:
            data["ethereum"] = {
                "price": result["ethereum"]["usd"],
                "change": result["ethereum"].get("usd_24h_change", 0),
                "unit": "unit",
                "live": True,
                "apiSource": "coingecko",
            }
    return data


def fetch_frankfurter():
    data = {}
    result = _safe_request(
        "https://api.frankfurter.app/latest",
        params={"from": "USD", "to": "INR,EUR,GBP"},
    )
    if result and "rates" in result:
        rates = result["rates"]
        data["usd_inr"] = {
            "price": rates.get("INR", FALLBACK_PRICES["usd_inr"]),
            "change": 0,
            "symbol": "USD/INR",
            "unit": "rate",
        }
        if rates.get("EUR"):
            data["eur_usd"] = {
                "price": round(1 / rates["EUR"], 4),
                "change": 0,
                "symbol": "EUR/USD",
                "unit": "rate",
            }
        if rates.get("GBP"):
            data["gbp_usd"] = {
                "price": round(1 / rates["GBP"], 4),
                "change": 0,
                "symbol": "GBP/USD",
                "unit": "rate",
            }
    return data


def fetch_market_data():
    market = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "live",
        "assets": {},
        "refreshSec": 10,
    }

    market["assets"].update(fetch_yahoo_assets())
    for coin, info in fetch_crypto_binance().items():
        if _valid_price(coin, info["price"]):
            market["assets"][coin] = {
                "price": info["price"],
                "change": info.get("change", 0),
                "symbol": coin.upper()[:3],
                "unit": "unit",
                "live": True,
                "apiSource": info.get("apiSource", "binance"),
            }
    for coin, info in fetch_coingecko().items():
        if coin in market["assets"] and market["assets"][coin].get("live"):
            continue
        if _valid_price(coin, info["price"]):
            market["assets"][coin] = {
                "price": info["price"],
                "change": info.get("change", 0),
                "symbol": coin.upper()[:3],
                "unit": "unit",
                "live": True,
                "apiSource": "coingecko",
            }
    market["assets"].update(fetch_frankfurter())

    live_count = sum(1 for a in market["assets"].values() if a.get("live"))
    for symbol, price in FALLBACK_PRICES.items():
        if symbol not in market["assets"] or not _valid_price(symbol, market["assets"][symbol]["price"]):
            unit = "oz" if symbol in ("gold", "silver", "platinum", "palladium") else "lb" if symbol == "copper" else "unit"
            market["assets"][symbol] = {
                "price": price,
                "change": 0,
                "symbol": symbol.upper(),
                "unit": unit,
                "live": False,
                "apiSource": "offline-estimate",
            }

    live_count = sum(1 for a in market["assets"].values() if a.get("live"))
    market["liveCount"] = live_count
    market["source"] = "live" if live_count >= 10 else "mixed" if live_count >= 5 else "offline"
    market["refreshSec"] = 5
    return market


def get_historical_prices(symbol, days=30):
    import numpy as np

    try:
        import yfinance as yf

        ticker = YAHOO_TICKERS.get(symbol, symbol)
        stock = yf.Ticker(ticker)
        hist = stock.history(period=f"{days}d")
        if not hist.empty:
            return hist["Close"].tolist()
    except Exception:
        pass

    base = FALLBACK_PRICES.get(symbol, 100.0)
    np.random.seed(hash(symbol) % 2**32)
    returns = np.random.normal(0.0002, 0.015, days)
    prices = [base]
    for r in returns:
        prices.append(prices[-1] * (1 + r))
    return prices
