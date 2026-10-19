# Monitor automático: DOF + Periódico Oficial de Nuevo León

Pipeline diario para GitHub Actions:

1. Revisa DOF y Periódico Oficial de Nuevo León.
2. Descarga los PDF candidatos de los últimos N días.
3. Identifica cada documento con un ID estable.
4. Compara SHA-256 contra Google Sheets.
5. Si no cambió: no hace OCR y no toca Drive.
6. Si es nuevo, cambió o quedó incompleto: convierte **cada página del PDF a PNG**, ejecuta OCR visual sobre esas imágenes a 300 DPI y valida cobertura completa.
7. Guarda únicamente el PDF original y su `.md` en Google Drive. Las subidas grandes usan upload resumible por bloques con reintentos y verificación final.
8. Registra/actualiza Google Sheets y pone `IA Estado = PENDIENTE`.
9. Workspace Studio puede usar ese cambio como disparador.

## Nombres en Drive

```text
DOF/2026/09/
  DOF_2026-09-05_MAT.pdf
  DOF_2026-09-05_MAT.md
  DOF_2026-09-05_VES.pdf
  DOF_2026-09-05_VES.md

NuevoLeon/2026/09/
  PONL_2026-09-05_Numero_123_Parte_01.pdf
  PONL_2026-09-05_Numero_123_Parte_01.md
```

El `.md` es solamente OCR completo; no contiene resumen ni análisis de IA.

## Comportamiento ante duplicados y cambios

- mismo `Documento ID` + mismo SHA-256 → `UNCHANGED`; no OCR, no actualización, no nuevo análisis.
- `Documento ID` nuevo → sube PDF + MD, `Revisión = 1`, `Cambio = NUEVO`, `IA Estado = PENDIENTE`.
- mismo `Documento ID` + SHA-256 diferente → reemplaza los bytes de los mismos archivos en Drive, incrementa `Revisión`, `Cambio = ACTUALIZADO`, `IA Estado = PENDIENTE`.

## Google Workspace / Service Account

Una Service Account no debe usarse como propietaria de archivos en My Drive: Google indica que las Service Accounts no tienen cuota y no pueden ser propietarias de archivos. Para esta configuración use una **Unidad compartida (Shared Drive)**.

1. En Google Cloud cree un proyecto.
2. Habilite:
   - Google Drive API
   - Google Sheets API
3. IAM y administración → Cuentas de servicio → Crear cuenta.
4. Cree una clave JSON y descárguela una sola vez.
5. En Google Drive cree una **Unidad compartida** llamada, por ejemplo, `Diarios Oficiales`.
6. Dentro cree una carpeta, por ejemplo, `Automatizado`.
7. Dentro de la Unidad compartida cree un Google Sheet llamado `Registro Diarios Oficiales`.
8. Agregue el correo de la Service Account como miembro de la Unidad compartida con permisos suficientes para crear/editar archivos.

No suba el JSON al repositorio.

## IDs que necesita

Carpeta raíz:

```text
https://drive.google.com/drive/folders/ESTE_ES_EL_FOLDER_ID
```

Google Sheet:

```text
https://docs.google.com/spreadsheets/d/ESTE_ES_EL_SHEET_ID/edit
```

## Configuración de GitHub

En el repositorio: `Settings → Secrets and variables → Actions`.

### Secret

`GOOGLE_SERVICE_ACCOUNT_JSON`

Pegue el contenido completo del JSON de la cuenta de servicio.

### Variables

```text
GOOGLE_DRIVE_ROOT_FOLDER_ID = ID de la carpeta Automatizado
GOOGLE_SHEET_ID             = ID de Registro Diarios Oficiales
GOOGLE_SHEET_TAB            = Monitor
LOOKBACK_DAYS               = 7
OCR_DPI                     = 300
OCR_WORKERS                 = 4
```

La pestaña `Monitor` se crea automáticamente si no existe. Debe estar vacía la primera vez; el programa crea los encabezados.

## Horario

`.github/workflows/diarios.yml` contiene:

```yaml
schedule:
  - cron: "17 6 * * *"
    timezone: "America/Monterrey"
```

Por tanto se programa diariamente a las 6:17 a. m. de Monterrey. Se evita el minuto 00 para reducir congestión del scheduler de GitHub. Los jobs programados siguen siendo best-effort y pueden iniciar después de la hora prevista.

## Primera prueba manual

No espere hasta mañana.

GitHub → `Actions` → `Monitor diarios oficiales` → `Run workflow`.

Seleccione `all` y deje `7` días.

En los logs debe observar alguno de estos estados:

```text
NUEVO ... -> Drive / Sheet
UNCHANGED ...
ACTUALIZADO ... -> Drive / Sheet
```

## Google Sheets y Workspace Studio

La pestaña `Monitor` queda con estas columnas:

- Documento ID
- Fecha
- Fuente
- Edición / Número
- Parte
- Nombre base
- URL origen
- SHA256
- PDF File ID
- PDF Drive
- MD File ID
- MD Drive
- Revisión
- OCR Estado
- IA Estado
- Cambio
- Actualizado UTC
- Verificado UTC

Configure Workspace Studio para reaccionar cuando `IA Estado` cambie a `PENDIENTE`. Al terminar su análisis, Workspace Studio debe poner `IA Estado = COMPLETADO`.

El monitor solo vuelve a poner `PENDIENTE` si aparece un documento nuevo o cambia el contenido del PDF existente.
