# Mallorca Agro

Aplicación web local para gestionar avisos, parcelas y observaciones de Llubí:
oídio y mildiu en viña, y Ceratitis capitata en cítricos.

**[Descargar Mallorca Agro para Windows](https://github.com/sebastiaam-glitch/prueba-1/raw/refs/heads/main/Mallorca-Agro-Windows.zip)**

Extrae el ZIP completo y abre `Mallorca-Agro.html`. No requiere instalar programas.

## Uso en Windows

Abre `Mallorca-Agro.html` con Edge, Chrome o Firefox, o ejecuta
`Abrir Alertas.bat`. No requiere instalación ni cuenta. El ZIP se debe extraer
completo antes de abrirlo. JavaScript debe estar activado.

1. En **Parcelas**, añade tu parcela, cultivo, variedad y estado actual.
2. En **Avisos**, consulta las señales y los datos pendientes. Puedes revisar
   cada aviso y dejarlo en seguimiento con una nota.
3. En **Cuaderno**, registra observaciones, síntomas o capturas por trampa y día.
4. En **Datos y criterios**, exporta periódicamente una copia JSON. Restaurarla
   sustituye los registros actuales tras confirmación.

Los registros se guardan en el navegador, sin servidor ni sincronización.
Mover el archivo, cambiar de navegador o borrar sus datos puede hacerlos
inaccesibles: exporta antes de esos cambios. Conserva la misma ruta de la app.
Esta versión es una app web que se abre en el navegador, no un instalador EXE.

## Fuentes y límites

- Previsión automática: Open-Meteo, coordenadas municipales 39.699, 3.005,
  horario Europe/Madrid, siete días. Requiere acceso HTTPS a
  `api.open-meteo.com`. No necesita clave para el uso personal no comercial
  previsto, sujeto a las condiciones de Open-Meteo.
- Consulta manual de la estación Llubí–Son Rossinyol: Balears Meteo.
  **No se importa automáticamente esa estación.** No se ha confirmado un
  acceso estructurado estable. La app identifica la fuente y permite anotar
  sus lecturas manualmente con fecha y hora.
- La previsión se actualiza al abrir y cada 30 minutos mientras esté abierta;
  se considera no evaluable si tiene más de seis horas o falta el día actual.
- No hay notificaciones con la app cerrada, correo, WhatsApp ni tareas en
  segundo plano. Los avisos están dentro de la aplicación.
- No se confirma presencia de plaga ni infección. Para oídio se usa una
  señal térmica de lecturas horarias, no el índice UC Davis completo.
  Para mildiu falta medir mojado foliar y no se calcula una infección.
  Para mosca se usa el estado del fruto y observaciones de trampas, sin
  convertir la temperatura en una estimación de población.
- Los estados revisados se refieren a un día y a los datos concretos del
  aviso. Al cambiar esos datos, el aviso requiere otra revisión. Las notas
  anteriores quedan visibles en el historial del cuaderno.
- No se recomiendan productos ni fechas de tratamiento.

Referencias y condiciones aparecen en **Datos y criterios** dentro de la app.
Los nombres de parcelas y las notas no se envían al servicio meteorológico.
El proveedor recibe las coordenadas municipales y la petición de red normal.

## Desarrollo

`index.html`, `agro.css` y `agro.js` son las fuentes, sin dependencias externas
de JavaScript ni compilación obligatoria. `temperaturas.html` conserva la
app anterior de temperaturas y su mapa geográfico.

Para regenerar el archivo portátil y el ZIP:

```sh
cd /workspace/prueba-1
python3 preparar.py
```

El ZIP se escribe en la raíz del proyecto como `Mallorca-Agro-Windows.zip`.
El enlace de descarga de este documento usa la copia publicada en GitHub.

Para desarrollo y comprobaciones en la nube:

```sh
cd /workspace/prueba-1
python3 -m http.server 8765 --bind 127.0.0.1
```

Usa peticiones locales para verificar la respuesta. Cada tarea de nube ya
está aislada: usa el checkout existente; no crees un worktree salvo petición
expresa del usuario. No se requiere instalar paquetes ni aportar credenciales.
Los procesos no se conservan entre tareas; inicia de nuevo el servidor si lo
necesitas para desarrollar. La versión portátil no necesita ese servidor.

Validado en Chromium Linux: crear y editar parcelas, avisos condicionados al
estado del cultivo, observaciones y capturas, revisión e historial,
persistencia al recargar, copias JSON, rechazo de copias inválidas y HTML
inyectado, fallos de red, datos caducados o incompletos, fallo al guardar y
pantalla de 390 px. Endpoint real comprobado con siete días y 168 lecturas.
No se ha ejecutado en Windows ni validado agronómicamente en una parcela.
