"""Split mistaken index.html (Python) into lexora_browser.py + HTML templates."""
from pathlib import Path

text = Path("index.html").read_text(encoding="utf-8")
start = text.find("LOGIN_HTML")
py_part = text[:start].rstrip() + "\n\n"
login_start = text.find('LOGIN_HTML = """') + len('LOGIN_HTML = """')
login_end = text.find('"""', login_start)
login_html = text[login_start:login_end]
main_start = text.find('MAIN_HTML = r"""') + len('MAIN_HTML = r"""')
main_end = text.find('"""', main_start)
main_html = text[main_start:main_end]
startup = text[text.find("if __name__") :]
full_py = py_part + f'LOGIN_HTML = """{login_html}"""\n\nMAIN_HTML = r"""{main_html}"""\n\n' + startup
Path("lexora_browser.py").write_text(full_py, encoding="utf-8")
Path("_login_template.html").write_text(login_html, encoding="utf-8")
Path("_app_template.html").write_text(main_html, encoding="utf-8")
print("Done", len(full_py))
