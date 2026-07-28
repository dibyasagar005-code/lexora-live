"""
AI Prediction Engine for LexorA.
Uses RSI, moving averages, volatility, and sklearn Linear Regression.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from api.market_data import get_historical_prices, FALLBACK_PRICES
from models.database import save_prediction


def calculate_rsi(prices, period=14):
    """Relative Strength Index - momentum oscillator."""
    if len(prices) < period + 1:
        return 50.0

    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.mean(gains[-period:])
    avg_loss = np.mean(losses[-period:])

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calculate_moving_average(prices, window=10):
    """Simple moving average of last N prices."""
    if len(prices) < window:
        return np.mean(prices) if prices else 0
    return np.mean(prices[-window:])


def calculate_volatility(prices, window=14):
    """Annualized volatility from daily returns."""
    if len(prices) < 2:
        return 0.0
    returns = np.diff(prices) / np.array(prices[:-1])
    return float(np.std(returns[-window:]) * np.sqrt(252) * 100)


def detect_trend(prices):
    """Trend direction from short vs long MA."""
    if len(prices) < 5:
        return "neutral"
    short_ma = calculate_moving_average(prices, 5)
    long_ma = calculate_moving_average(prices, 20) if len(prices) >= 20 else calculate_moving_average(prices, len(prices))
    if short_ma > long_ma * 1.01:
        return "bullish"
    elif short_ma < long_ma * 0.99:
        return "bearish"
    return "neutral"


def linear_regression_forecast(prices, horizon=5):
    """
    sklearn Linear Regression for price forecasting.
    Returns expected future price.
    """
    if len(prices) < 5:
        base = prices[-1] if prices else 100
        return base, [base] * horizon

    X = np.arange(len(prices)).reshape(-1, 1)
    y = np.array(prices)
    model = LinearRegression()
    model.fit(X, y)

    future_X = np.arange(len(prices), len(prices) + horizon).reshape(-1, 1)
    forecast = model.predict(future_X)
    return float(forecast[-1]), forecast.tolist()


def generate_signal(rsi, trend, current_price, expected_price, volatility):
    """
    Combine indicators into UP / DOWN / HOLD signal with confidence.
    """
    score = 0  # positive = bullish, negative = bearish

    # RSI signals
    if rsi < 30:
        score += 2  # oversold - buy
    elif rsi > 70:
        score -= 2  # overbought - sell
    elif 40 <= rsi <= 60:
        score += 0  # neutral

    # Trend
    if trend == "bullish":
        score += 1.5
    elif trend == "bearish":
        score -= 1.5

    # Price momentum
    price_change_pct = ((expected_price - current_price) / current_price) * 100
    if price_change_pct > 1:
        score += 1
    elif price_change_pct < -1:
        score -= 1

    # High volatility reduces confidence
    vol_penalty = min(volatility / 50, 0.3)

    if score >= 2:
        signal = "UP"
        confidence = min(95, 70 + abs(score) * 5) * (1 - vol_penalty)
    elif score <= -2:
        signal = "DOWN"
        confidence = min(95, 70 + abs(score) * 5) * (1 - vol_penalty)
    else:
        signal = "HOLD"
        confidence = min(85, 60 + (10 - abs(score)) * 3) * (1 - vol_penalty)

    return signal, round(confidence, 1)


def sentiment_analysis(symbol, prices):
    """
    Simple AI sentiment from price action and RSI.
    Returns sentiment label and score -1 to 1.
    """
    rsi = calculate_rsi(prices)
    trend = detect_trend(prices)

    score = 0
    if trend == "bullish":
        score += 0.4
    elif trend == "bearish":
        score -= 0.4

    if rsi < 35:
        score += 0.3
    elif rsi > 65:
        score -= 0.3

    if score > 0.3:
        label = "Bullish"
    elif score < -0.3:
        label = "Bearish"
    else:
        label = "Neutral"

    return {"label": label, "score": round(score, 2), "rsi": round(rsi, 1)}


def risk_meter(volatility, rsi):
    """Calculate risk level 0-100 from volatility and RSI extremes."""
    vol_risk = min(volatility * 2, 50)
    rsi_risk = 0
    if rsi > 75 or rsi < 25:
        rsi_risk = 25
    elif rsi > 65 or rsi < 35:
        rsi_risk = 15
    return min(100, round(vol_risk + rsi_risk))


def buy_sell_recommendation(signal, confidence):
    """Map prediction signal to human-readable recommendation."""
    if signal == "UP" and confidence > 65:
        return "BUY", "Strong upward momentum detected"
    elif signal == "DOWN" and confidence > 65:
        return "SELL", "Bearish pressure increasing"
    elif signal == "UP":
        return "ACCUMULATE", "Moderate bullish outlook"
    elif signal == "DOWN":
        return "REDUCE", "Consider reducing exposure"
    return "HOLD", "Market consolidating - wait for clearer signal"


def run_prediction(symbol, current_market_price=None):
    """
    Main prediction pipeline for a given asset symbol.
    Returns full prediction dict and persists to database.
    Uses live market price if provided, otherwise fetches historical data.
    """
    prices = get_historical_prices(symbol, days=60)
    
    # If historical prices are insufficient, use fallback with clear indication
    if not prices or len(prices) < 3:
        base = FALLBACK_PRICES.get(symbol, 100.0)
        prices = [base * (1 + i * 0.001) for i in range(30)]
    
    # Use provided live market price if available, otherwise use last historical price
    if current_market_price and current_market_price > 0:
        current_price = float(current_market_price)
        # Update the last price in historical data with live price
        if prices:
            prices[-1] = current_price
    else:
        current_price = float(prices[-1])
    
    rsi = calculate_rsi(prices)
    volatility = calculate_volatility(prices)
    trend = detect_trend(prices)
    expected_price, forecast_series = linear_regression_forecast(prices)
    signal, confidence = generate_signal(rsi, trend, current_price, expected_price, volatility)
    sentiment = sentiment_analysis(symbol, prices)
    action, reason = buy_sell_recommendation(signal, confidence)
    risk = risk_meter(volatility, rsi)

    result = {
        "symbol": symbol,
        "signal": signal,
        "confidence": confidence,
        "trend": trend,
        "current_price": round(current_price, 2),
        "expected_price": round(expected_price, 2),
        "rsi": round(rsi, 1),
        "volatility": round(volatility, 2),
        "forecast": [round(p, 2) for p in forecast_series],
        "historical": [round(p, 2) for p in prices[-30:]],
        "sentiment": sentiment,
        "recommendation": action,
        "recommendation_reason": reason,
        "risk_level": risk,
        "data_source": "live" if current_market_price else "historical",
    }

    # Persist prediction
    save_prediction(
        symbol, signal, confidence, trend,
        expected_price, rsi, volatility,
    )

    return result


def predict_all_assets(market_data=None):
    """Run predictions for all supported assets using live market data if available."""
    assets = [
        "gold", "silver", "bitcoin", "ethereum", "platinum",
        "crude_oil", "sp500", "nasdaq", "usd_inr",
    ]
    
    results = {}
    for symbol in assets:
        current_price = None
        if market_data and market_data.get("assets", {}).get(symbol):
            current_price = market_data["assets"][symbol].get("price")
        results[symbol] = run_prediction(symbol, current_market_price=current_price)
    
    return results
