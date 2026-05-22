from pathlib import Path

head = Path("lexora_browser.py").read_text(encoding="utf-8").split("# ─── Routes")[0].rstrip()
login_html = Path("_login_template.html").read_text(encoding="utf-8")
main_html = Path("_app_template.html").read_text(encoding="utf-8")

routes = Path("routes_snippet.py").read_text(encoding="utf-8") if Path("routes_snippet.py").exists() else ""

routes_body = '''
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        if not name or len(name) < 2:
            return render_template_string(LOGIN_HTML, error="Enter your name (min 2 chars)")
        with get_db() as conn:
            row = conn.execute("SELECT id, name FROM users WHERE name = ?", (name,)).fetchone()
            if row:
                uid = row["id"]
            else:
                cur = conn.execute("INSERT INTO users (name) VALUES (?)", (name,))
                uid = cur.lastrowid
        session["user_id"] = uid
        session["user_name"] = name
        log_user(uid, "login", name)
        return redirect(url_for("index"))
    if current_user():
        return redirect(url_for("index"))
    return render_template_string(LOGIN_HTML, error=None)

@app.route("/logout")
def logout():
    u = current_user()
    if u:
        log_user(u["id"], "logout")
    session.clear()
    return redirect(url_for("login"))

@app.route("/")
def index():
    if not current_user():
        return redirect(url_for("login"))
    return render_template_string(MAIN_HTML, user=current_user(), views=VIEWS, metals=METALS)

@app.route("/api/state")
def api_state():
    if not current_user():
        return jsonify({"error": "not logged in"}), 401
    return jsonify(state_snapshot())

@app.route("/api/history")
def api_history():
    if not current_user():
        return jsonify({"error": "not logged in"}), 401
    metal = request.args.get("metal", "gold")
    limit = min(int(request.args.get("limit", 40)), 200)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT metal, inr_per_gram, usd_per_oz, usd_inr, recorded_at FROM price_history WHERE metal = ? ORDER BY id DESC LIMIT ?",
            (metal, limit),
        ).fetchall()
    return jsonify([dict(r) for r in reversed(rows)])

@app.route("/api/log_view", methods=["POST"])
def api_log_view():
    u = current_user()
    if not u:
        return jsonify({"ok": False}), 401
    view = request.json.get("view", "") if request.is_json else ""
    log_user(u["id"], "view", view)
    return jsonify({"ok": True})

@app.route("/api/calc", methods=["POST"])
def api_calc():
    if not current_user():
        return jsonify({"error": "not logged in"}), 401
    data = request.get_json(force=True) or {}
    metal = data.get("metal", "gold")
    grams = float(data.get("grams", 0))
    snap = state_snapshot()
    price = snap["prices"].get(metal)
    if not price or grams <= 0:
        return jsonify({"error": "invalid"})
    total = grams * price
    log_user(current_user()["id"], "calc", f"{grams}g {metal}")
    return jsonify({"total": total, "per_gram": price, "metal": metal, "grams": grams})

if __name__ == "__main__":
    init_db()
    refresh_prices()
    t = threading.Thread(target=background_worker, daemon=True)
    t.start()
    print("LexorA Browser running at http://127.0.0.1:5000")
    print("Database:", DB_PATH)
    app.run(host="127.0.0.1", port=5000, debug=False)
'''

parts = [
    head,
    '\n\nLOGIN_HTML = """\n',
    login_html,
    '\n"""\n\nMAIN_HTML = r"""\n',
    main_html,
    '\n"""\n\n# ─── Routes ───────────────────────────────────────────────────────────────────\n',
    routes_body,
]
Path("lexora_browser.py").write_text("".join(parts), encoding="utf-8")
print("OK")
