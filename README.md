# Joseador Remoto

Asistente de busqueda de empleo para profesionales de tecnologia — pensado desde Republica Dominicana, para cualquier pais. Elige los mercados donde buscas trabajo, trae empleos de fuentes legitimas, gestiona postulaciones, optimiza tu CV con inteligencia artificial y preparate para entrevistas — todo desde una sola app de escritorio, sin servidor.

## Caracteristicas

- **Mercados**: Indica donde vives y donde buscas empleo (paises, regiones como Latinoamerica o la UE, o remoto desde cualquier pais). Cada empleo muestra si esta abierto a tus mercados; las convenciones del CV (foto, fecha de nacimiento, cedula, paginas, papel A4/Carta) siguen el pais del empleo
- **Busqueda de empleos**: Fuentes oficiales y gratuitas (Himalayas, Jobicy, Remotive, Get on Board), portales locales con tu clave gratuita (Jooble, Adzuna) y los portales de las empresas que sigues (Greenhouse, Lever, Ashby). SerpApi y Apify siguen disponibles, con aviso de riesgo legal
- **Pegar o importar por enlace**: Pega el texto de una oferta o su enlace (Greenhouse, Lever, Ashby, Workday, SmartRecruiters o paginas con datos estructurados)
- **Elegibilidad, nunca descarte**: Todos los empleos se guardan; la elegibilidad para tus mercados se muestra como insignia y filtro
- **Gestion de CV**: Sube, analiza y optimiza tus hojas de vida con analisis ATS
- **Postulaciones**: Tablero Kanban para rastrear el estado de cada postulacion
- **Preparacion de entrevistas**: Pitch builder, historias STAR, preguntas para el entrevistador y checklist
- **Generacion con IA**: CV optimizado, cartas de presentacion y analisis de coincidencia usando tu propio LLM (BYOT)
- **Calendario**: Vista de entrevistas programadas con notificaciones
- **i18n**: Interfaz completa en espanol (LATAM) e ingles; CVs generados tambien en portugues y aleman
- **100% local**: Tus datos viven en SQLite en tu equipo; las claves de API se guardan en el almacen de credenciales del sistema operativo y nunca salen de tu maquina

## Requisitos previos

| Requisito | Detalle |
|-----------|---------|
| [Node.js](https://nodejs.org/) | Version 20.19 o superior (recomendado: LTS actual, v24). Incluye npm. La app ejecuta `node` en tiempo de ejecucion para el parser de CVs, asi que debe estar en el `PATH` |
| [Rust](https://www.rust-lang.org/tools/install) | Instalar via **rustup** (necesario para compilar Tauri) |
| **Windows**: Visual Studio Build Tools | Workload **"Desktop development with C++"** — [descargar aqui](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Sin esto, `cargo`/Tauri no compilan |
| **Windows**: WebView2 Runtime | Preinstalado en Windows 10/11 actualizados. Si falta: [descargar de Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| **macOS**: Xcode Command Line Tools | `xcode-select --install` — ver [guia de macOS](#macos) |
| **Linux**: dependencias de sistema de Tauri | WebKitGTK 4.1, OpenSSL, AppIndicator, librsvg y compiladores — ver [guia de Linux](#linux) con comandos por distribucion |

> Ya **no** se necesita Playwright, Docker ni PostgreSQL. El scraping con navegador fue retirado; los empleos llegan por APIs (SerpApi/Apify) y todo corre dentro de la app.

## Guia por sistema operativo

Instala los requisitos de tu sistema y luego sigue [Instalacion desde cero](#instalacion-desde-cero). Los comandos siguen la [guia oficial de prerequisitos de Tauri v2](https://v2.tauri.app/start/prerequisites/).

### Windows

```powershell
# Descarga e instala rustup desde https://rustup.rs o con winget:
winget install Rustlang.Rustup

# Verifica la instalacion (abre una terminal nueva):
rustc --version
cargo --version
```

Si `cargo build` falla con errores de `link.exe`, falta el workload "Desktop development with C++" de Visual Studio Build Tools.

### macOS

Funciona en Macs con Apple Silicon (M1/M2/M3/M4...) e Intel.

```bash
# 1. Herramientas de linea de comandos de Xcode (compilador, git, etc.)
xcode-select --install

# 2. Homebrew (gestor de paquetes) — omite si ya lo tienes
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
#    En Apple Silicon, sigue las instrucciones "Next steps" que imprime el
#    instalador para agregar brew al PATH (eval "$(/opt/homebrew/bin/brew shellenv)")

# 3. Node.js (LTS)
brew install node

# 4. Rust via rustup (acepta la opcion por defecto)
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"

# 5. Verifica
node --version    # v20.19+ (idealmente v24)
npm --version
rustc --version
cargo --version
```

> **Por que Node con Homebrew y no nvm en macOS**: la app compilada (abierta desde Finder o el Dock) no hereda el `PATH` de tu terminal, asi que no ve el `node` de nvm. Homebrew lo instala en `/opt/homebrew/bin` (o `/usr/local/bin` en Intel), que si es visible. Para `npm run tauri dev` cualquiera de los dos funciona.

### Linux

#### 1. Dependencias de sistema

Tauri v2 necesita **WebKitGTK 4.1**, que esta disponible en Ubuntu 22.04+, Debian 12+, Fedora 36+ y en las versiones actuales de Arch/openSUSE. Distribuciones mas antiguas no son compatibles.

**Debian / Ubuntu / Linux Mint / Pop!_OS / elementary OS**

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Fedora**

```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel
sudo dnf group install "c-development"
```

**Fedora Silverblue / Kinoite (rpm-ostree)**

```bash
sudo rpm-ostree install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel \
  gcc \
  gcc-c++ \
  make
sudo systemctl reboot
```

**Arch Linux / Manjaro / EndeavourOS**

```bash
sudo pacman -Syu
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool
```

**openSUSE (Tumbleweed / Leap)**

```bash
sudo zypper up
sudo zypper in webkit2gtk3-devel \
  libopenssl-devel \
  curl \
  wget \
  file \
  libappindicator3-1 \
  librsvg-devel
sudo zypper in -t pattern devel_basis
```

**Alpine Linux**

```bash
sudo apk add \
  build-base \
  webkit2gtk-4.1-dev \
  curl \
  wget \
  file \
  openssl \
  libayatana-appindicator-dev \
  librsvg \
  font-dejavu
```

**Gentoo**

```bash
sudo emerge --ask \
  net-libs/webkit-gtk:4.1 \
  dev-libs/libayatana-appindicator \
  net-misc/curl \
  net-misc/wget \
  sys-apps/file
```

**NixOS**: consulta la [pagina de Tauri en el wiki de NixOS](https://wiki.nixos.org/wiki/Tauri) para un `shell.nix`/`flake.nix` con las dependencias.

#### 2. Node.js

Los repositorios de algunas distribuciones traen versiones viejas de Node. La forma mas sencilla de tener la LTS actual es con [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
# Abre una terminal nueva (o: source ~/.bashrc) y luego:
nvm install --lts
```

Alternativa: el paquete de tu distribucion si es v20.19 o superior (`sudo pacman -S nodejs npm`, `sudo dnf install nodejs`, etc.), o los [repositorios de NodeSource](https://github.com/nodesource/distributions) en Debian/Ubuntu/Fedora.

> Si vas a instalar la app compilada (`.deb`/`.rpm`/AppImage) y abrirla desde el menu de aplicaciones, `node` debe ser visible fuera de tu shell. Con nvm, crea un enlace: `sudo ln -s "$(which node)" /usr/local/bin/node`. Para `npm run tauri dev` no hace falta.

#### 3. Rust

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
source "$HOME/.cargo/env"
```

#### 4. Verificar

```bash
node --version    # v20.19+ (idealmente v24)
npm --version
rustc --version
cargo --version
pkg-config --modversion webkit2gtk-4.1   # debe imprimir una version 2.x
```

## Instalacion desde cero

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/joseador-remoto.git
cd joseador-remoto

# 2. Instalar dependencias del frontend
npm install

# 3. Instalar dependencias del sidecar (parser de CVs)
cd sidecar
npm install
cd ..

# 4. Iniciar la app de escritorio en modo desarrollo
#    (la primera vez tarda varios minutos: compila Rust)
npm run tauri dev
```

Para generar el instalador de produccion (compila en el mismo sistema operativo de destino — no hay compilacion cruzada):

```bash
# Windows (.msi / .exe de NSIS — los targets configurados en tauri.conf.json)
npm run tauri build

# Linux (.deb, .rpm y AppImage)
npm run tauri build -- --bundles deb,rpm,appimage

# macOS (.app y .dmg)
npm run tauri build -- --bundles app,dmg

# Resultado en: src-tauri/target/release/bundle/
```

> `src-tauri/tauri.conf.json` solo declara `msi` y `nsis` como targets, por eso en Linux y macOS hay que indicar los formatos con `--bundles`. Puedes pedir solo uno (ej. `--bundles deb`). Los builds de macOS no estan firmados ni notarizados — ver [Solucion de problemas](#solucion-de-problemas).

## Configurar la busqueda de empleos

Las fuentes gratuitas (Himalayas, Jobicy, Remotive, Get on Board) funcionan sin configurar nada y se filtran segun tus mercados. En **Configuraciones → Busqueda de empleos** puedes:

- Activar o desactivar cada fuente
- Agregar tu clave gratuita de [Jooble](https://jooble.org/api/about) (60+ paises, incluida RD) o de [Adzuna](https://developer.adzuna.com/) (EE. UU., Canada, Reino Unido, Espana, Alemania, Mexico, Brasil…)
- Seguir empresas: pega el enlace de su portal en Greenhouse, Lever o Ashby y cada vacante nueva se importa directamente del empleador

Opcionalmente, puedes seguir usando SerpApi (Google Jobs) y Apify (LinkedIn) con tus propias claves. **Aviso**: Google demando a SerpApi en diciembre de 2025 y los terminos de LinkedIn prohiben el scraping; para ofertas de LinkedIn, pega el texto de la oferta.

### 1. Obtener una clave de SerpApi (Google Jobs)

1. Crea una cuenta en [serpapi.com](https://serpapi.com/users/sign_up)
2. Copia tu clave desde [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key)
3. **Plan gratuito**: 250 busquedas/mes y 50/hora. Cada pagina de resultados = 1 busqueda = hasta 10 empleos
4. Los limites por defecto de la app (30/dia, 250/mes) estan calibrados a ese plan — la app **nunca** excede los limites que configures

### 2. Obtener un token de Apify (LinkedIn)

1. Crea una cuenta en [apify.com](https://console.apify.com/sign-up)
2. Copia tu token desde **Settings → API & Integrations** ([enlace directo](https://console.apify.com/settings/integrations))
3. **Plan gratuito**: $5/mes de credito. El actor de LinkedIn ([Advanced LinkedIn Job Search API](https://apify.com/fantastic-jobs/advanced-linkedin-job-search-api)) cuesta ~$1.50 por cada 1,000 resultados — el credito gratis alcanza para ~3,000 empleos/mes
4. Los limites por defecto (4 ejecuciones/dia, 30/mes, 100 empleos por ejecucion) se mantienen dentro del plan gratuito

### 3. Configurar las claves en la app

1. Abre **Configuraciones → Busqueda de empleos**
2. Pega la clave de SerpApi y/o el token de Apify (se guardan en el almacen de credenciales del sistema; nunca salen de tu equipo)
3. Opcional: edita los **terminos de busqueda** (consultas de Google Jobs y filtros de titulo de LinkedIn). Consejos:
   - No agregues palabras como "remote" o "remoto" — lo remoto se aplica con un filtro del API y esas palabras solo reducen resultados
   - En los titulos de LinkedIn, termina con `:*` para coincidencia por prefijo (ej. `iOS:*` encuentra "iOS Developer", "iOS Engineer", ...)
   - Los predeterminados ya cubren todo el espectro tech en ingles y espanol; "Restaurar predeterminados" vuelve a la lista original
4. Opcional: ajusta los **limites de presupuesto** si tienes un plan pagado

### 4. Ejecutar una busqueda

- En la pagina **Empleos**, presiona **"Buscar empleos"**. La busqueda es manual — corre solo cuando tu lo pides
- Con la lista de consultas predeterminada (mas grande que el limite diario de SerpApi), la app **rota** las consultas: cada ejecucion continua donde la anterior se quedo, asi en 2-3 ejecuciones cubres la lista completa
- LinkedIn es **incremental**: cada ejecucion solo trae empleos publicados despues de la ejecucion anterior, sin pagar dos veces por la misma ventana
- Los empleos con datos incompletos se guardan igual (insignia "Datos incompletos") y se pueden completar despues con IA — nunca se descarta un empleo

## Configurar IA (BYOT)

1. Obtiene una clave API de [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), [Google AI Studio](https://aistudio.google.com/), [xAI](https://console.x.ai/) o [DeepSeek](https://platform.deepseek.com/)
2. Ve a **Configuraciones → Modelos de IA**
3. Pega tu clave API en el proveedor correspondiente
4. Selecciona el modelo y establecelo como activo

## Scripts disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo Vite (solo frontend) |
| `npm run build` | Verificacion TypeScript + build Vite |
| `npm run preview` | Preview del build de produccion |
| `npm run tauri dev` | App Tauri en modo desarrollo |
| `npm run tauri build` | Compilar ejecutable de escritorio |
| `npm run test` | Ejecutar pruebas con Vitest |
| `npm run test:watch` | Pruebas en modo watch |
| `npm run lint` | Verificacion de tipos TypeScript |

## Arquitectura

```
joseador-remoto/
  src/                  # Frontend React + TypeScript
    components/         # Componentes UI reutilizables
    features/           # Modulos por funcionalidad
    pages/              # Paginas/rutas
    lib/                # Utilidades, i18n
      markets/          # Paises, regiones, elegibilidad por mercado, convenciones de CV
      job-capture/      # Identidad de URLs, JSON-LD, APIs de ATS (importar por enlace)
    stores/             # Estado global (Zustand)
    services/           # SQLite, dedup, almacenamiento, captura de empleos
      ingest/           # Fuentes de empleo (feeds legitimos, portales de empresas, SerpApi, Apify)
  src-tauri/            # Backend Rust (Tauri v2): SQLite, HTTP, cifrado
  sidecar/              # Proceso Node.js SOLO para parsear CVs (PDF/DOCX)
```

- **Una sola app**: no hay servidor. El pipeline de scraping corre en la app y escribe directo a SQLite local (`joseador.db` en el directorio de configuracion de la app)
- Las llamadas HTTP a SerpApi/Apify pasan por el backend Rust (`http_fetch`) porque esos APIs no permiten llamadas desde un navegador (CORS)
- Presupuesto y cursores de reanudacion se guardan en SQLite: una busqueda interrumpida (limite alcanzado, cierre de la app) continua donde quedo sin pagar paginas repetidas

## Solucion de problemas

| Problema | Solucion |
|----------|----------|
| `error: linker 'link.exe' not found` al compilar | Instala Visual Studio Build Tools con el workload "Desktop development with C++" |
| La ventana abre en blanco (Windows) | Falta WebView2 Runtime — [descargar](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| `cargo: command not found` / `rustc: command not found` (Linux/macOS) | Abre una terminal nueva o ejecuta `source "$HOME/.cargo/env"` |
| `The system library 'webkit2gtk-4.1' / 'javascriptcoregtk-4.1' required by crate ... was not found` (Linux) | Instala los paquetes de desarrollo de tu distro ([guia de Linux](#linux)). Ubuntu < 22.04 y Debian < 12 no tienen WebKitGTK 4.1: actualiza la distribucion |
| Error sobre `appindicator` / `ayatana` al compilar o al iniciar (Linux) | La app usa icono de bandeja: instala `libayatana-appindicator3-dev` (Debian/Ubuntu) o `libappindicator-gtk3` (Arch/Fedora) |
| Ventana en blanco o errores `EGL`/`DMABUF` (Linux, sobre todo NVIDIA o Wayland) | Ejecuta con `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev` (o exporta la variable antes de abrir la app) |
| "La app esta danada" o "desarrollador no identificado" (macOS) | El build no esta firmado. Ejecuta `xattr -cr "/Applications/Joseador Remoto.app"` o abre con clic derecho → Abrir |
| "Failed to spawn sidecar" al subir un CV con la app instalada (Linux/macOS) | La app abierta desde el menu/Finder no ve el `node` de nvm. En macOS: `brew install node`. En Linux: `sudo ln -s "$(which node)" /usr/local/bin/node` o instala Node con el paquete de la distro |
| "Sidecar script not found" al subir un CV | Ejecuta `npm run build` dentro de `sidecar/` (o reinicia `npm run tauri dev`, que lo compila automaticamente) |
| "Busqueda completada" con nota de presupuesto | Alcanzaste el limite diario/mensual configurado — la proxima ejecucion continua donde quedo. Ajusta los limites en Configuraciones → Busqueda de empleos |
| No aparecen empleos al buscar | Verifica que la clave de SerpApi o el token de Apify esten configurados y sean validos (Configuraciones → Busqueda de empleos) |

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/mi-feature`)
3. Asegurate de que `npm run lint`, `npm run test` y `npm run build` pasen sin errores
4. Todas las cadenas de texto visibles al usuario deben usar `t()` de i18next
5. Incluye traducciones en espanol (`src/lib/i18n/es/`) e ingles (`src/lib/i18n/en/`)
6. Abre un Pull Request con una descripcion clara

## Licencia

MIT
