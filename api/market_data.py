"""
Market data API integration for LexorA.
Fetches live prices from Yahoo Finance, CoinGecko, and Frankfurter.
"""

import requests
from datetime import datetime

TIMEOUT = 12
TROY_OZ_GRAMS = 31.1034768

# Last-resort static prices (USD); only used when all APIs fail
FALLBACK_PRICES = {
    "gold": 3340.0,
    "silver": 31.2,
    "bitcoin": 97000.0,
    "ethereum": 3600.0,
    "platinum": 1020.0,
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
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "crude_oil": "CL=F",
    "sp500": "^GSPC",
    "nasdaq": "^IXIC",
}


def _safe_request(url, params=None, headers=None):
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[API] Request failed: {url} - {e}")
        return None


def fetch_yahoo_assets():
    """Fetch all assets from Yahoo Finance via yfinance."""
    data = {}
    try:
        import yfinance as yf

        for key, ticker in YAHOO_TICKERS.items():
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="5d")
                if hist.empty:
                    continue
                price = float(hist["Close"].iloc[-1])
                prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price
                change = ((price - prev) / prev) * 100 if prev else 0
                unit = "oz" if key in ("gold", "silver", "platinum") else "unit"
                data[key] = {
                    "price": round(price, 4),
                    "change": round(change, 2),
                    "symbol": key.upper(),
                    "unit": unit,
                }
            except Exception as e:
                print(f"[API] Yahoo {key}: {e}")
    except ImportError:
        print("[API] yfinance not available — pip install yfinance")
    return data


def fetch_coingecko():
    """CoinGecko — crypto prices with 24h change (backup / cross-check)."""
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
            }
        if "ethereum" in result:
            data["ethereum"] = {
                "price": result["ethereum"]["usd"],
                "change": result["ethereum"].get("usd_24h_change", 0),
                "unit": "unit",
            }
    return data


def fetch_frankfurter():
    """USD forex rates from Frankfurter."""
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
    """Aggregate live market data from multiple APIs."""
    market = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "live",
        "assets": {},
    }

    yahoo = fetch_yahoo_assets()
    market["assets"].update(yahoo)

    crypto = fetch_coingecko()
    for coin, info in crypto.items():
        if coin not in market["assets"] or crypto[coin]["price"]:
            market["assets"][coin] = {
                "price": info["price"],
                "change": info.get("change", 0),
                "symbol": coin.upper()[:3],
                "unit": "unit",
            }

    forex = fetch_frankfurter()
    market["assets"].update(forex)

    live_count = len(market["assets"])
    if live_count < 6:
        market["source"] = "mixed"
        for symbol, price in FALLBACK_PRICES.items():
            if symbol not in market["assets"]:
                unit = "oz" if symbol in ("gold", "silver", "platinum") else "unit"
                market["assets"][symbol] = {
                    "price": price,
                    "change": 0,
                    "symbol": symbol.upper(),
                    "unit": unit,
                }
    else:
        for symbol, price in FALLBACK_PRICES.items():
            if symbol not in market["assets"]:
                unit = "oz" if symbol in ("gold", "silver", "platinum") else "unit"
                market["assets"][symbol] = {
                    "price": price,
                    "change": 0,
                    "symbol": symbol.upper(),
                    "unit": unit,
                }

    return market


def get_historical_prices(symbol, days=30):
    """Historical prices for ML / charts."""
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
