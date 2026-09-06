# App web — Diarios Oficiales

Esta app vive en el mismo repositorio que el monitor Python. No sustituye ni modifica el scraper: añade una interfaz de consulta sobre el Google Sheet consolidado y los PDF/Markdown ya guardados en Drive.

## Funciones

- Lista DOF y Periódico Oficial de Nuevo León, más recientes primero.
- Lee las pestañas `Monitor` y `Analisis`.
- Usa `Documento ID` para agrupar documentos.
- Separa correctamente bundles que incluyan publicaciones distintas.
- En Nuevo León reúne `Parte 01`, `Parte 02`, etc. en una misma publicación.
- Mantiene `PENDIENTE`/`ENVIADO` si el monitor detectó una revisión nueva, aunque exista un análisis anterior completado.
- Muestra resumen, cambios, vivienda, urbanismo, infraestructura, construcción, uso de suelo, permisos, municipios y dependencias.
- Previsualiza PDF dentro de la app.
- Renderiza el OCR Markdown bajo demanda.
- Descarga PDF y Markdown.
- Conserva links de Drive y fuente oficial cuando existen.
- Incluye botón **Abrir en ChatGPT** que construye un prompt con los datos y enlaces reales de la publicación y abre `https://chatgpt.com/?q=...` en una pestaña nueva.
- La integración con ChatGPT es solamente un enlace del navegador: no usa OpenAI API, Gemini, claves de IA ni un backend de chat.
- Incluye botón **Ejecutar monitor** para disparar manualmente el workflow existente de GitHub Actions mediante `workflow_dispatch`.
- Tiene búsqueda, filtros y diseño responsive.
- Incluye manifest para agregar la web a pantalla de inicio.

## Arquitectura

```text
DOF / Periódico Oficial NL
        ↓
monitor Python + GitHub Actions
        ↓
Google Drive (PDF + MD)
        ↓
Google Sheets (Monitor + Analisis)
        ↓
Next.js server-side
        ↓
App web
```

Las credenciales de Google y GitHub se usan únicamente en el servidor. El navegador nunca recibe el JSON de Service Account ni el token de GitHub.

La API de archivos usa scopes de Google de solo lectura y únicamente permite servir IDs de PDF/MD que estén registrados en las publicaciones del Sheet. También reenvía peticiones `Range` para mejorar la visualización de PDFs grandes.

### Abrir una publicación en ChatGPT

El botón de ChatGPT no llama a ningún modelo desde la app. Genera el prompt en el cliente a partir de la publicación seleccionada e incluye los enlaces disponibles a Markdown, PDF y fuente oficial.

El enlace final tiene esta forma:

```text
https://chatgpt.com/?q=<PROMPT_CODIFICADO>
```

Para que ChatGPT pueda abrir directamente un archivo de Drive, ese enlace debe ser accesible para el usuario/ChatGPT correspondiente. Si los archivos de Drive son privados, el usuario puede abrirlos desde esta app o ajustar sus permisos antes de intentar analizarlos desde ChatGPT.

`?q=` no es una API de OpenAI ni requiere una API key; es únicamente un enlace de navegación generado por la interfaz.

## Ejecutar GitHub Actions desde la app

El workflow `.github/workflows/diarios.yml` ya declara `workflow_dispatch` con los inputs `lookback_days` y `source`. La app reutiliza ese trigger y no crea un workflow paralelo.

El flujo es:

```text
Botón Ejecutar monitor
        ↓
POST /api/actions/run
        ↓
valida MONITOR_TRIGGER_SECRET
        ↓
GitHub REST API /actions/workflows/{workflow}/dispatches
        ↓
workflow_dispatch
        ↓
Monitor DOF / Nuevo León
```

La llamada a GitHub ocurre exclusivamente desde el servidor de Next.js. `GITHUB_ACTIONS_TOKEN` nunca se serializa al cliente.

### Token recomendado

Usa un **fine-grained Personal Access Token** limitado únicamente al repositorio del monitor con:

```text
Repository permissions
Actions: Read and write
```

No reutilices ese PAT como código del botón. El usuario introduce `MONITOR_TRIGGER_SECRET`, que es una clave independiente y que el servidor compara antes de llamar a GitHub.

La interfaz permite seleccionar:

- todas las fuentes;
- sólo DOF;
- sólo Periódico Oficial de Nuevo León;
- de 1 a 7 días de revisión.

Cuando GitHub devuelve la URL del run, la app muestra un enlace directo **Ver ejecución en GitHub**. Si la versión de la API no devuelve un run individual, se enlaza a la página del workflow.

## Desarrollo local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Luego abre `http://localhost:3000`.

Para comprobar tipos:

```bash
npm run typecheck
```

Para simular el build de producción:

```bash
npm run build
npm start
```

## Variables de entorno

Consulta `.env.example`.

Para lectura del Sheet/Drive:

```text
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_SHEET_ID
GOOGLE_SHEET_MONITOR_TAB=Monitor
GOOGLE_SHEET_ANALYSIS_TAB=Analisis
```

Para ejecución manual de GitHub Actions:

```text
GITHUB_ACTIONS_TOKEN
GITHUB_ACTIONS_REPOSITORY
GITHUB_ACTIONS_WORKFLOW=diarios.yml
GITHUB_ACTIONS_REF=main
MONITOR_TRIGGER_SECRET
```

`GITHUB_ACTIONS_REPOSITORY` puede inferirse automáticamente de `VERCEL_GIT_REPO_OWNER` + `VERCEL_GIT_REPO_SLUG` cuando Vercel expone esas variables, pero declararlo explícitamente hace el deploy más portable.

No uses `NEXT_PUBLIC_` para ninguna credencial o secreto.

## Deploy en Vercel

1. En Vercel crea un proyecto e importa `MarioIbago/monitor-diarios-oficiales`.
2. Deja el **Root Directory** en la raíz del repositorio.
3. Vercel detectará el `package.json` y Next.js.
4. En **Project Settings → Environment Variables** agrega las variables de `.env.example`.
5. En `GOOGLE_SERVICE_ACCOUNT_JSON` pega el JSON completo de la Service Account.
6. Configura `GOOGLE_SHEET_ID` con el Sheet consolidado correspondiente al entorno.
7. Configura `GITHUB_ACTIONS_TOKEN` y `MONITOR_TRIGGER_SECRET` para habilitar el botón de ejecución.
8. Despliega.

El monitor programado de `.github/workflows/diarios.yml` continúa funcionando de forma independiente aunque el botón manual no esté configurado.

## Rutas principales

```text
/                           dashboard
/publicaciones/[id]         detalle
/api/publications           JSON normalizado de consulta
/api/files/[fileId]         preview/descarga segura de Drive
/api/actions/run             dispara workflow_dispatch de forma autenticada
```

## Nota de privacidad y seguridad

Esta versión no añade un sistema de login completo. Si el dominio de Vercel se comparte públicamente, los análisis visibles en la aplicación también serán públicos. El endpoint que ejecuta GitHub Actions sí exige `MONITOR_TRIGGER_SECRET` antes de utilizar el PAT server-side para evitar que visitantes anónimos puedan gastar minutos de Actions.

Los archivos de Drive no necesitan hacerse públicos para verse dentro de la app porque se sirven mediante la Service Account desde el backend; sólo necesitan ser accesibles externamente si se pretende que ChatGPT abra sus URLs de Drive directamente.
