"""Build static index.html and app.html for GitHub Pages."""
from pathlib import Path

login = Path("_login_template.html").read_text(encoding="utf-8")
login = login.replace("{% if error %}<p class=\"err\">{{ error }}</p>{% endif %}", '<p class="err" id="loginErr" style="display:none"></p>')
login = login.replace('<form method="post">', '<form id="loginForm">')
login = login.replace('</form>', '</form>\n<script>\ndocument.getElementById("loginForm").onsubmit = function(e) {\n  e.preventDefault();\n  const n = (this.name.value || "").trim();\n  if (n.length < 2) { document.getElementById("loginErr").style.display="block"; document.getElementById("loginErr").textContent="Enter name (min 2 chars)"; return; }\n  localStorage.setItem("lexora_user", n);\n  location.href = "app.html";\n};\nif (localStorage.getItem("lexora_user")) location.href = "app.html";\n</script>')
Path("index.html").write_text(login, encoding="utf-8")

app = Path("_app_template.html").read_text(encoding="utf-8")
# Use external CSS + JS
head_end = app.find("</head>")
body = app[app.find("<body>") : app.find("<script>")]
body = body.replace("{{ user.name }}", '<span class="user-name"></span>')
body = body.replace('<a href="/logout"', '<button type="button" id="logoutBtn"')
body = body.replace('</a>', '')
body = body.replace('style="text-decoration:none"><button type="button" class="logout-btn">Logout</button>', 'class="logout-btn">Logout')
app_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LexorA Browser</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Segoe+UI&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
{body}
<script src="app-public.js"></script>
</html>
"""
Path("app.html").write_text(app_html, encoding="utf-8")
Path(".nojekyll").write_text("", encoding="utf-8")
print("Built index.html, app.html")
