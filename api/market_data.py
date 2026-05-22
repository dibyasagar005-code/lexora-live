"""
Market data API integration for LexorA.
Fetches live prices from free APIs with offline fallback.
"""

import requests
import random
from datetime import datetime

# Request timeout for all external APIs
TIMEOUT = 10

# Offline fallback prices (approximate baselines)
FALLBACK_PRICES = {
    "gold": 2650.0,
    "silver": 31.5,
    "bitcoin": 67500.0,
    "ethereum": 3500.0,
    "platinum": 980.0,
    "crude_oil": 78.5,
    "usd_inr": 83.25,
    "sp500": 5200.0,
    "nasdaq": 16500.0,
    "eur_usd": 1.08,
    "gbp_usd": 1.27,
}


def _safe_request(url, params=None, headers=None):
    """Perform HTTP GET with error handling."""
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[API] Request failed: {url} - {e}")
        return None


def fetch_metals_live():
    """Fetch gold and silver from metals.live API."""
    data = {}
    try:
        # metals.live spot endpoint
        result = _safe_request("https://api.metals.live/v1/spot")
        if result and isinstance(result, list):
            for item in result:
                metal = item.get("metal", "").lower()
                if metal == "gold":
                    data["gold"] = float(item.get("price", FALLBACK_PRICES["gold"]))
                elif metal == "silver":
                    data["silver"] = float(item.get("price", FALLBACK_PRICES["silver"]))
    except Exception:
        pass
    return data


def fetch_coingecko():
    """Fetch Bitcoin and Ethereum from CoinGecko."""
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
            }
        if "ethereum" in result:
            data["ethereum"] = {
                "price": result["ethereum"]["usd"],
                "change": result["ethereum"].get("usd_24h_change", 0),
            }
    return data


def fetch_frankfurter():
    """Fetch USD/INR and forex rates from Frankfurter API."""
    data = {}
    result = _safe_request(
        "https://api.frankfurter.app/latest",
        params={"from": "USD", "to": "INR,EUR,GBP"},
    )
    if result and "rates" in result:
        rates = result["rates"]
        data["usd_inr"] = rates.get("INR", FALLBACK_PRICES["usd_inr"])
        data["eur_usd"] = 1 / rates.get("EUR", 0.92) if rates.get("EUR") else 1.08
        data["gbp_usd"] = 1 / rates.get("GBP", 0.79) if rates.get("GBP") else 1.27
    return data


def fetch_yahoo_finance():
    """Fetch stock indices and commodities via yfinance."""
    data = {}
    try:
        import yfinance as yf

        symbols = {
            "sp500": "^GSPC",
            "nasdaq": "^IXIC",
            "crude_oil": "CL=F",
            "platinum": "PL=F",
        }
        for key, ticker in symbols.items():
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="2d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price
                    change = ((price - prev) / prev) * 100 if prev else 0
                    data[key] = {"price": price, "change": change}
            except Exception:
                pass
    except ImportError:
        print("[API] yfinance not available")
    return data


def fetch_market_data():
    """
    Aggregate all market data from multiple APIs.
    Returns unified dict with all asset prices.
    """
    market = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "live",
        "assets": {},
    }

    # Metals
    metals = fetch_metals_live()
    if metals.get("gold"):
        market["assets"]["gold"] = {"price": metals["gold"], "change": 0, "symbol": "XAU"}
    if metals.get("silver"):
        market["assets"]["silver"] = {"price": metals["silver"], "change": 0, "symbol": "XAG"}

    # Crypto
    crypto = fetch_coingecko()
    for coin in ["bitcoin", "ethereum"]:
        if coin in crypto:
            market["assets"][coin] = {
                "price": crypto[coin]["price"],
                "change": crypto[coin].get("change", 0),
                "symbol": coin.upper()[:3],
            }

    # Forex
    forex = fetch_frankfurter()
    if forex.get("usd_inr"):
        market["assets"]["usd_inr"] = {
            "price": forex["usd_inr"],
            "change": 0,
            "symbol": "USD/INR",
        }
    if forex.get("eur_usd"):
        market["assets"]["eur_usd"] = {
            "price": forex["eur_usd"],
            "change": 0,
            "symbol": "EUR/USD",
        }

    # Stocks & commodities
    yahoo = fetch_yahoo_finance()
    for key in ["sp500", "nasdaq", "crude_oil", "platinum"]:
        if key in yahoo:
            market["assets"][key] = {
                "price": yahoo[key]["price"],
                "change": yahoo[key]["change"],
                "symbol": key.upper(),
            }

    # Apply offline fallback for missing assets
    if len(market["assets"]) < 5:
        market["source"] = "fallback"
        for symbol, price in FALLBACK_PRICES.items():
            if symbol not in market["assets"]:
                # Simulate small random variation for realism
                variation = price * random.uniform(-0.002, 0.002)
                market["assets"][symbol] = {
                    "price": price + variation,
                    "change": random.uniform(-1.5, 1.5),
                    "symbol": symbol.upper(),
                }

    return market


def get_historical_prices(symbol, days=30):
    """
    Fetch historical price series for ML training.
    Uses yfinance when available, else generates synthetic data.
    """
    import numpy as np

    ticker_map = {
        "gold": "GC=F",
        "silver": "SI=F",
        "bitcoin": "BTC-USD",
        "ethereum": "ETH-USD",
        "crude_oil": "CL=F",
        "platinum": "PL=F",
        "sp500": "^GSPC",
        "nasdaq": "^IXIC",
    }

    try:
        import yfinance as yf

        ticker = ticker_map.get(symbol, symbol)
        stock = yf.Ticker(ticker)
        hist = stock.history(period=f"{days}d")
        if not hist.empty:
            return hist["Close"].tolist()
    except Exception:
        pass

    # Synthetic fallback series
    base = FALLBACK_PRICES.get(symbol, 100.0)
    np.random.seed(hash(symbol) % 2**32)
    returns = np.random.normal(0.0002, 0.015, days)
    prices = [base]
    for r in returns:
        prices.append(prices[-1] * (1 + r))
    return prices
