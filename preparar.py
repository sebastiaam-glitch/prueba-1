"""Genera la versión portátil y un ZIP sin dependencias de Python externas."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
page = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'agro.css').read_text(encoding='utf-8')
js = (root / 'agro.js').read_text(encoding='utf-8')
page = page.replace('<link rel="stylesheet" href="agro.css">', '<style>' + css + '</style>')
page = page.replace('<script src="agro.js" defer></script>', '')
page = page.replace('</body>', '<script>\n' + js + '\n</script></body>')
(root / 'Mallorca-Agro.html').write_text(page, encoding='utf-8')
output = root / 'Mallorca-Agro-Windows.zip'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in ['Mallorca-Agro.html', 'Abrir Alertas.bat', 'LEEME.txt', 'temperaturas.html']:
        data = (root / name).read_bytes()
        if name.endswith('.bat'):
            data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        archive.writestr('Mallorca-Agro/' + name, data)
with ZipFile(output) as archive:
    assert archive.testzip() is None
print('Versión portátil:', root / 'Mallorca-Agro.html')
print('ZIP verificado:', output)
