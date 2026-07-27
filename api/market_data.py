"""
Market data API integration for LexorA.
Yahoo Finance + CoinGecko + Frankfurter with price validation.
"""

import requests
from datetime import datetime

TIMEOUT = 12
TROY_OZ_GRAMS = 31.1034768

PRICE_RANGES = {
    # Precious Metals
    "gold": (1500, 8000),
    "silver": (12, 150),
    "platinum": (700, 4000),
    "palladium": (800, 6000),
    "rhodium": (1000, 15000),
    # Industrial Metals
    "copper": (2, 15),
    "aluminum": (1500, 3500),
    "nickel": (10000, 35000),
    "zinc": (2000, 5000),
    "lead": (1500, 3500),
    # Cryptocurrencies
    "bitcoin": (10000, 250000),
    "ethereum": (500, 25000),
    "ripple": (0.2, 5),
    "cardano": (0.2, 5),
    "solana": (10, 300),
    "dogecoin": (0.05, 2),
    "polkadot": (3, 60),
    "avalanche": (10, 200),
    "chainlink": (5, 50),
    # Forex Pairs
    "usd_inr": (70, 110),
    "eur_usd": (0.85, 1.25),
    "gbp_usd": (1.0, 1.45),
    "usd_jpy": (100, 160),
    "aud_usd": (0.55, 0.85),
    "usd_cad": (1.2, 1.6),
    "usd_chf": (0.85, 1.1),
    # Commodities
    "crude_oil": (35, 200),
    "natural_gas": (1.5, 10),
    "wheat": (400, 900),
    "corn": (350, 800),
    "soybeans": (900, 1800),
    # Stock Indices
    "sp500": (3000, 9000),
    "nasdaq": (10000, 35000),
    "dow_jones": (30000, 45000),
    "ftse_100": (6500, 8500),
    "nikkei_225": (28000, 42000),
    # Individual Stocks
    "apple": (100, 250),
    "microsoft": (300, 500),
    "google": (120, 200),
    "amazon": (100, 200),
    "tesla": (150, 400),
}

FALLBACK_PRICES = {
    # Precious Metals
    "gold": 3340.0,
    "silver": 31.2,
    "platinum": 1020.0,
    "palladium": 980.0,
    "rhodium": 4500.0,
    # Industrial Metals
    "copper": 4.25,
    "aluminum": 2400.0,
    "nickel": 18000.0,
    "zinc": 3200.0,
    "lead": 2200.0,
    # Cryptocurrencies
    "bitcoin": 97000.0,
    "ethereum": 3600.0,
    "ripple": 0.55,
    "cardano": 0.45,
    "solana": 145.0,
    "dogecoin": 0.15,
    "polkadot": 7.5,
    "avalanche": 35.0,
    "chainlink": 14.0,
    # Forex Pairs
    "usd_inr": 83.5,
    "eur_usd": 1.08,
    "gbp_usd": 1.27,
    "usd_jpy": 149.5,
    "aud_usd": 0.65,
    "usd_cad": 1.36,
    "usd_chf": 0.88,
    # Commodities
    "crude_oil": 72.0,
    "natural_gas": 2.8,
    "wheat": 620.0,
    "corn": 580.0,
    "soybeans": 1150.0,
    # Stock Indices
    "sp500": 5900.0,
    "nasdaq": 19500.0,
    "dow_jones": 39000.0,
    "ftse_100": 7500.0,
    "nikkei_225": 35000.0,
    # Individual Stocks
    "apple": 175.0,
    "microsoft": 420.0,
    "google": 155.0,
    "amazon": 175.0,
    "tesla": 245.0,
}

YAHOO_TICKERS = {
    # Precious Metals
    "gold": "GC=F",
    "silver": "SI=F",
    "platinum": "PL=F",
    "palladium": "PA=F",
    "rhodium": None,
    # Industrial Metals
    "copper": "HG=F",
    "aluminum": None,
    "nickel": None,
    "zinc": None,
    "lead": None,
    # Cryptocurrencies
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "ripple": "XRP-USD",
    "cardano": "ADA-USD",
    "solana": "SOL-USD",
    "dogecoin": "DOGE-USD",
    "polkadot": "DOT-USD",
    "avalanche": "AVAX-USD",
    "chainlink": "LINK-USD",
    # Forex Pairs
    "usd_inr": "INR=X",
    "eur_usd": "EURUSD=X",
    "gbp_usd": "GBPUSD=X",
    "usd_jpy": "USDJPY=X",
    "aud_usd": "AUDUSD=X",
    "usd_cad": "USDCAD=X",
    "usd_chf": "USDCHF=X",
    # Commodities
    "crude_oil": "CL=F",
    "natural_gas": "NG=F",
    "wheat": None,
    "corn": None,
    "soybeans": None,
    # Stock Indices
    "sp500": "^GSPC",
    "nasdaq": "^IXIC",
    "dow_jones": "^DJI",
    "ftse_100": "^FTSE",
    "nikkei_225": "^N225",
    # Individual Stocks
    "apple": "AAPL",
    "microsoft": "MSFT",
    "google": "GOOGL",
    "amazon": "AMZN",
    "tesla": "TSLA",
}

YAHOO_ALT = {
    "gold": ["XAUUSD=X", "GC=F"],
    "silver": ["XAGUSD=X", "SI=F"],
    "platinum": ["XPTUSD=X", "PL=F"],
    "palladium": ["XPDUSD=X", "PA=F"],
    "rhodium": ["XAU=X"],
    "copper": ["HG=F"],
    "aluminum": ["ALI=F"],
    "nickel": ["LME:NSI"],
    "natural_gas": ["NG=F"],
    "wheat": ["ZW=F"],
    "corn": ["ZC=F"],
    "soybeans": ["ZS=F"],
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


def fetch_ibja_india():
    """IBJA benchmark — Indian gold/silver (PhonePe-style INR rates)."""
    out = {}
    gold = _safe_request("https://ibja-api.vercel.app/latest")
    silver = _safe_request("https://ibja-api.vercel.app/silver/latest")
    inr = FALLBACK_PRICES.get("usd_inr", 83.5)
    fx = _safe_request("https://open.er-api.com/v6/latest/USD")
    if fx and fx.get("rates", {}).get("INR"):
        inr = float(fx["rates"]["INR"])
    if gold:
        g10 = float(gold.get("lblGold999_AM") or gold.get("lblGold999_PM") or 0)
        if g10 > 50000:
            inr_g = g10 / 10
            usd_oz = (inr_g / inr) * TROY_OZ_GRAMS
            if _valid_price("gold", usd_oz):
                am = float(gold.get("lblGold999_AM") or 0) / 10
                pm = float(gold.get("lblGold999_PM") or 0) / 10
                chg = ((pm - am) / am) * 100 if am and pm else 0
                out["gold"] = {
                    "price": usd_oz,
                    "change": round(chg, 2),
                    "symbol": "GOLD",
                    "unit": "oz",
                    "live": True,
                    "apiSource": "IBJA India",
                    "inrPerGram24k": inr_g,
                }
    if silver:
        sk = float(silver.get("lblSilver999_AM") or silver.get("lblSilver999_PM") or 0)
        if sk > 50000:
            inr_s = sk / 1000
            usd_oz = (inr_s / inr) * TROY_OZ_GRAMS
            if _valid_price("silver", usd_oz):
                out["silver"] = {
                    "price": usd_oz,
                    "change": 0,
                    "symbol": "SILVER",
                    "unit": "oz",
                    "live": True,
                    "apiSource": "IBJA India",
                    "inrPerGram999": inr_s,
                }
    return out


def fetch_minted_metal():
    out = {}
    data = _safe_request("https://mintedmetal.com/api/prices.json")
    if not data or "metals" not in data:
        return out
    for key in ("gold", "silver", "platinum", "palladium"):
        m = data["metals"].get(key)
        if not m:
            continue
        price = float(m.get("price", 0))
        prev = float(m.get("previousPrice", 0))
        chg = ((price - prev) / prev) * 100 if prev else 0
        if _valid_price(key, price):
            out[key] = {
                "price": price,
                "change": round(chg, 2),
                "symbol": key.upper(),
                "unit": "oz",
                "live": True,
                "apiSource": "mintedmetal.com",
            }
    return out


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
    data = fetch_ibja_india()
    for key, row in fetch_minted_metal().items():
        if key not in data or not data[key].get("live"):
            data[key] = row
        elif key in ("gold", "silver") and row.get("change"):
            data[key]["change"] = row["change"]
            data[key]["price"] = row.get("price") or data[key]["price"]
    if not data.get("gold"):
        data.update(fetch_goldprice_org())
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


def fetch_crypto_coingecko_extended():
    """Fetch extended cryptocurrency data from CoinGecko."""
    data = {}
    crypto_ids = {
        "bitcoin": "bitcoin",
        "ethereum": "ethereum",
        "ripple": "ripple",
        "cardano": "cardano",
        "solana": "solana",
        "dogecoin": "dogecoin",
        "polkadot": "polkadot",
        "avalanche": "avalanche-2",
        "chainlink": "chainlink",
    }
    try:
        result = _safe_request(
            "https://api.coingecko.com/api/v3/simple/price",
            params={
                "ids": ",".join(crypto_ids.values()),
                "vs_currencies": "usd",
                "include_24hr_change": "true",
            },
        )
        if result:
            for key, coin_id in crypto_ids.items():
                if coin_id in result:
                    data[key] = {
                        "price": result[coin_id]["usd"],
                        "change": result[coin_id].get("usd_24h_change", 0),
                        "unit": "unit",
                        "live": True,
                        "apiSource": "coingecko",
                    }
    except Exception as e:
        print(f"[API] CoinGecko extended error: {e}")
    return data


def fetch_forex_extended():
    """Fetch extended forex data."""
    data = {}
    try:
        result = _safe_request(
            "https://api.frankfurter.app/latest",
            params={"from": "USD", "to": "INR,EUR,GBP,JPY,AUD,CAD,CHF"},
        )
        if result and "rates" in result:
            rates = result["rates"]
            data["usd_inr"] = {
                "price": rates.get("INR", FALLBACK_PRICES["usd_inr"]),
                "change": 0,
                "symbol": "USD/INR",
                "unit": "rate",
                "live": True,
                "apiSource": "frankfurter",
            }
            if rates.get("EUR"):
                data["eur_usd"] = {
                    "price": round(1 / rates["EUR"], 4),
                    "change": 0,
                    "symbol": "EUR/USD",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
            if rates.get("GBP"):
                data["gbp_usd"] = {
                    "price": round(1 / rates["GBP"], 4),
                    "change": 0,
                    "symbol": "GBP/USD",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
            if rates.get("JPY"):
                data["usd_jpy"] = {
                    "price": rates.get("JPY", FALLBACK_PRICES["usd_jpy"]),
                    "change": 0,
                    "symbol": "USD/JPY",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
            if rates.get("AUD"):
                data["aud_usd"] = {
                    "price": rates.get("AUD", FALLBACK_PRICES["aud_usd"]),
                    "change": 0,
                    "symbol": "AUD/USD",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
            if rates.get("CAD"):
                data["usd_cad"] = {
                    "price": rates.get("CAD", FALLBACK_PRICES["usd_cad"]),
                    "change": 0,
                    "symbol": "USD/CAD",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
            if rates.get("CHF"):
                data["usd_chf"] = {
                    "price": rates.get("CHF", FALLBACK_PRICES["usd_chf"]),
                    "change": 0,
                    "symbol": "USD/CHF",
                    "unit": "rate",
                    "live": True,
                    "apiSource": "frankfurter",
                }
    except Exception as e:
        print(f"[API] Forex extended error: {e}")
    return data


def fetch_market_data():
    market = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "live",
        "assets": {},
        "refreshSec": 30,
    }

    # Fetch existing assets
    market["assets"].update(fetch_yahoo_assets())
    
    # Fetch extended crypto
    for coin, info in fetch_crypto_coingecko_extended().items():
        if _valid_price(coin, info["price"]):
            market["assets"][coin] = {
                "price": info["price"],
                "change": info.get("change", 0),
                "symbol": coin.upper()[:3],
                "unit": "unit",
                "live": True,
                "apiSource": info.get("apiSource", "coingecko"),
            }
    
    # Fetch Binance for BTC/ETH (more reliable)
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
    
    # Fetch extended forex
    market["assets"].update(fetch_forex_extended())

    # Fill missing assets with fallback
    live_count = sum(1 for a in market["assets"].values() if a.get("live"))
    for symbol, price in FALLBACK_PRICES.items():
        if symbol not in market["assets"] or not _valid_price(symbol, market["assets"][symbol]["price"]):
            unit = "oz" if symbol in ("gold", "silver", "platinum", "palladium", "rhodium") else "lb" if symbol in ("copper", "aluminum", "nickel", "zinc", "lead") else "unit"
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
    market["total"] = len(market["assets"])
    market["source"] = "live" if live_count >= 20 else "mixed" if live_count >= 10 else "offline"
    market["refreshSec"] = 30
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
