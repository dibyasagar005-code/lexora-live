/**
 * LexorA Chart.js Visualizations
 * Line, forecast, candlestick simulation, comparison, volatility charts
 */

const LexoraCharts = {
    chartDefaults: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { labels: { color: '#7a9bb8' } },
        },
        scales: {
            x: { ticks: { color: '#7a9bb8' }, grid: { color: 'rgba(0,240,255,0.05)' } },
            y: { ticks: { color: '#7a9bb8' }, grid: { color: 'rgba(0,240,255,0.05)' } },
        },
    },

    _instances: {},

    /** Destroy existing chart on canvas to prevent memory leaks */
    _destroy(id) {
        if (this._instances[id]) {
            this._instances[id].destroy();
            delete this._instances[id];
        }
    },

    /** Historical price line chart */
    initHistoryChart(canvasId, prices) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx || !prices?.length) return;
        this._destroy(canvasId);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: prices.map((_, i) => i + 1),
                datasets: [{
                    label: 'Price',
                    data: prices,
                    borderColor: '#00f0ff',
                    backgroundColor: 'rgba(0,240,255,0.1)',
                    fill: true,
                    tension: 0.3,
                }],
            },
            options: this.chartDefaults,
        });
    },

    /** AI forecast chart - historical + predicted */
    initForecastChart(canvasId, historical, forecast) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        this._destroy(canvasId);
        const histLen = historical.length;
        const labels = [
            ...historical.map((_, i) => `T-${histLen - i}`),
            ...forecast.map((_, i) => `F+${i + 1}`),
        ];
        this._instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Historical',
                        data: [...historical, ...Array(forecast.length).fill(null)],
                        borderColor: '#00f0ff',
                        tension: 0.3,
                    },
                    {
                        label: 'AI Forecast',
                        data: [...Array(historical.length - 1).fill(null), historical[historical.length - 1], ...forecast],
                        borderColor: '#ffd700',
                        borderDash: [5, 5],
                        tension: 0.3,
                    },
                ],
            },
            options: this.chartDefaults,
        });
    },

    /** Candlestick-style OHLC simulation */
    async initCandlestickChart(canvasId, symbol) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        let prices = [];
        try {
            const res = await fetch(`/api/history/${symbol}`);
            const data = await res.json();
            prices = data.historical || [];
        } catch (e) {
            prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 10 + i);
        }
        // Simulate OHLC bars using bar chart
        const ohlc = prices.slice(-15).map(p => ({
            o: p * 0.998,
            h: p * 1.01,
            l: p * 0.99,
            c: p,
        }));
        this._destroy(canvasId);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ohlc.map((_, i) => `Bar ${i + 1}`),
                datasets: [
                    { label: 'High', data: ohlc.map(d => d.h), backgroundColor: 'rgba(0,255,136,0.6)' },
                    { label: 'Low', data: ohlc.map(d => d.l), backgroundColor: 'rgba(255,68,102,0.6)' },
                    { label: 'Close', data: ohlc.map(d => d.c), backgroundColor: 'rgba(0,240,255,0.6)' },
                ],
            },
            options: { ...this.chartDefaults, scales: { x: { stacked: false }, y: { stacked: false } } },
        });
    },

    /** Home page - market comparison normalized */
    async initComparisonChart(canvasId) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        try {
            const market = LexoraApp?.market || await LexoraAPI.fetchMarket();
            const assets = Object.entries(market.assets || {}).slice(0, 6);
            const maxPrices = assets.map(([, a]) => a.price);
            const normalized = maxPrices.map(p => (p / Math.max(...maxPrices)) * 100);
            this._destroy(canvasId);
            this._instances[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: assets.map(([s]) => s.replace('_', ' ').toUpperCase()),
                    datasets: [{
                        label: 'Relative Strength (%)',
                        data: normalized,
                        backgroundColor: [
                            'rgba(0,240,255,0.7)', 'rgba(255,215,0,0.7)',
                            'rgba(0,255,136,0.7)', 'rgba(255,68,102,0.7)',
                            'rgba(138,43,226,0.7)', 'rgba(255,140,0,0.7)',
                        ],
                    }],
                },
                options: this.chartDefaults,
            });
        } catch (e) { /* silent */ }
    },

    /** Volatility chart from predictions API */
    async initVolatilityChart(canvasId) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        try {
            const data = await LexoraAPI.predictAll();
            const labels = [];
            const values = [];
            Object.entries(data).slice(0, 8).forEach(([sym, p]) => {
                labels.push(sym.replace('_', ' '));
                values.push(p.volatility || 10);
            });
            this._destroy(canvasId);
            this._instances[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Volatility %',
                        data: values,
                        borderColor: '#ff4466',
                        backgroundColor: 'rgba(255,68,102,0.2)',
                        fill: true,
                        tension: 0.4,
                    }],
                },
                options: this.chartDefaults,
            });
        } catch (e) { /* silent */ }
    },

    /** Live price stream on markets page */
    async initLivePriceChart(canvasId) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        const symbols = ['bitcoin', 'gold', 'ethereum'];
        const datasets = [];
        const colors = ['#00f0ff', '#ffd700', '#00ff88'];
        for (let i = 0; i < symbols.length; i++) {
            try {
                const prices = await LexoraAPI.history(symbols[i], 30);
                datasets.push({
                    label: symbols[i].toUpperCase(),
                    data: prices,
                    borderColor: colors[i],
                    tension: 0.3,
                    fill: false,
                });
            } catch (e) { /* skip */ }
        }
        if (!datasets.length) return;
        this._destroy(canvasId);
        const maxLen = Math.max(...datasets.map((d) => d.data.length));
        this._instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({ length: maxLen }, (_, i) => i + 1),
                datasets,
            },
            options: this.chartDefaults,
        });
    },

    /** Curated data timeline on history page */
    async initCuratedChart(canvasId, symbol) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        try {
            const res = await fetch(`/api/history/${symbol}`);
            const data = await res.json();
            const curated = data.curated || [];
            const prices = curated.map(c => c.close_price);
            const normalized = curated.map(c => c.normalized_value);
            this._destroy(canvasId);
            this._instances[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: prices.map((_, i) => i + 1),
                    datasets: [
                        { label: 'Close Price', data: prices, borderColor: '#00f0ff', yAxisID: 'y' },
                        { label: 'Normalized', data: normalized, borderColor: '#ffd700', yAxisID: 'y1' },
                    ],
                },
                options: {
                    ...this.chartDefaults,
                    scales: {
                        y: { type: 'linear', position: 'left', ticks: { color: '#7a9bb8' } },
                        y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#ffd700' } },
                    },
                },
            });
        } catch (e) { /* silent */ }
    },

    /** Dashboard portfolio chart */
    initPortfolioChart(canvasId) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        this._destroy(canvasId);
        // Demo portfolio growth curve
        const data = [100, 105, 103, 110, 115, 112, 120, 125, 122, 130];
        this._instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map((_, i) => `Week ${i + 1}`),
                datasets: [{
                    label: 'Portfolio Value ($)',
                    data,
                    borderColor: '#ffd700',
                    backgroundColor: 'rgba(255,215,0,0.15)',
                    fill: true,
                    tension: 0.3,
                }],
            },
            options: this.chartDefaults,
        });
    },
};
