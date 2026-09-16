# MiniZRD Lopez Track 🏁
> **Plataforma Integral de Gestión de Campeonatos, Clasificaciones, Telemetría y Hall of Fame para Carreras RC Mini-Z.**

---

## 📋 Tabla de Contenidos
1. [Descripción General](#-descripción-general)
2. [Stack Tecnológico y Arquitectura](#-stack-tecnológico-y-arquitectura)
3. [Estructura del Proyecto](#-estructura-del-proyecto)
4. [Modelo de Datos y Contratos (Data Dictionary)](#-modelo-de-datos-y-contratos-data-dictionary)
5. [Reglas de Negocio del Sistema](#-reglas-de-negocio-del-sistema)
   - [5.1 Gestión de Participantes por Campeonato](#51-gestión-de-participantes-por-campeonato-sdriverids)
   - [5.2 Ciclo de Vida y Estados del Campeonato](#52-ciclo-de-vida-y-estados-del-campeonato)
   - [5.3 Sistema de Puntuación Automática](#53-sistema-de-puntuación-automática)
   - [5.4 Algoritmo de Rating Histórico (0–99 OVR)](#54-algoritmo-de-rating-histórico-099-ovr)
   - [5.5 Comparador Cara a Cara (Head to Head)](#55-comparador-cara-a-cara-head-to-head)
6. [Contratos y Reglas de Gráficos y Telemetría (Chart.js)](#-contratos-y-reglas-de-gráficos-y-telemetría-chartjs)
   - [6.1 Prevención del Bucle de Expansión Infinita](#61-prevención-del-bucle-de-expansión-infinita)
   - [6.2 Estándares Visuales Obligatorios](#62-estándares-visuales-obligatorios)
   - [6.3 Restricciones Estrictas de Texto](#63-restricciones-estrictas-de-texto)
7. [Panel de Administración y Persistencia](#-panel-de-administración-y-persistencia)
8. [Guía para Agentes y Desarrolladores Futuros](#-guía-para-agentes-y-desarrolladores-futuros)

---

## 🚀 Descripción General

**MiniZRD Lopez Track** es una aplicación web SPA (Single Page Application) diseñada específicamente para la administración, seguimiento y análisis de ligas de automovilismo a escala RC Mini-Z.

Permite a organizadores y pilotos:
- Administrar múltiples campeonatos independientes en paralelo (activos o históricos).
- Gestionar listas de participantes específicos por campeonato, permitiendo inscripciones tardías sin distorsionar carreras pasadas.
- Registrar resultados de carreras con asignación automática de puntos, poles y vueltas rápidas.
- Visualizar telemetrías y análisis avanzados (evolución de posiciones, acumulación de puntos, luchas por el podio, gaps y rendimiento por escuderías).
- Consultar un **Hall of Fame** con un algoritmo ponderado que califica a cada piloto con un Overall Rating de 0 a 99.
- Comparar el rendimiento histórico de dos pilotos lado a lado mediante la herramienta **Head to Head**.

---

## 💻 Stack Tecnológico y Arquitectura

La aplicación está construida intencionalmente sin frameworks pesados para garantizar rendimiento instantáneo, portabilidad y bajo consumo de recursos:

- **Frontend Core**: HTML5 semántico y JavaScript estándar (ES6+ Vanilla).
- **Estilos**: Vanilla CSS moderno (`style.css`) con variables CSS (Design Tokens), soporte para temas claro/oscuro (`body.light`), componentes tipo tarjeta y layouts responsivos con Flexbox y CSS Grid.
- **Gráficos y Visualización**: [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) (v4) para telemetría interactiva y gráficos de carreras.
- **Base de Datos y Persistencia**: 
  - **Firebase Realtime Database (RTDB)** y **Firebase Auth** para sincronización en tiempo real en la nube y autenticación de administradores.
  - **LocalStorage Fallback**: Respaldo local automático en el navegador ante desconexiones o uso sin credenciales.
- **Control de Versiones**: Git (`main` en `https://github.com/lacedexe/minizrd-track.git`).

---

## 📂 Estructura del Proyecto

```text
MiniZRD_LopezTrack_v24/
│
├── index.html        # Estructura SPA, navegación, vistas y modales
├── style.css         # Sistema de diseño, tokens, componentes y media queries
├── script.js         # Lógica central: datos, campeonatos, carreras, admin y Hall of Fame
├── analysis.js       # Gráficos Chart.js, telemetrías del campeonato y Head to Head
├── logo.png          # Logotipo oficial de la liga
└── README.md         # Documentación de reglas, arquitectura y contratos
```

### Funciones Principales por Archivo

| Archivo | Responsabilidad Principal |
|---|---|
| [`index.html`](file:///c:/Users/pinai/Downloads/MiniZRD_LopezTrack_v24/index.html) | Define las secciones (`#inicio`, `#temporadas`, `#campeonato`, `#ranking`, `#head2head`, `#pilotos`, `#resultados`, `#pistas`, `#admin`) y contenedores de gráficos con wrappers acotados. |
| [`style.css`](file:///c:/Users/pinai/Downloads/MiniZRD_LopezTrack_v24/style.css) | Tokens CSS, layout responsivo, `.chartCard`, `.chartContainer`, tablas, modales y adaptaciones móviles. |
| [`script.js`](file:///c:/Users/pinai/Downloads/MiniZRD_LopezTrack_v24/script.js) | Maneja el estado global `db`, funciones de cálculo (`standings()`, `ratingFor()`), migración de datos, panel admin y sincronización con Firebase. |
| [`analysis.js`](file:///c:/Users/pinai/Downloads/MiniZRD_LopezTrack_v24/analysis.js) | Renderizado de gráficos con Chart.js (`renderChampCharts()`), configuración de escalas, paletas, leyendas derechas y comparador H2H. |

---

## 🗄️ Modelo de Datos y Contratos (Data Dictionary)

Todo el estado de la aplicación reside en el objeto global reactivo `db`:

```typescript
interface DatabaseSchema {
  site: string;                    // Nombre de la pista / liga (ej. 'MiniZRD Lopez Track')
  activeSeason: string | null;     // ID del campeonato activo seleccionado
  points: number[];                // Puntuación por posición (ej. [25, 18, 15, 12, 10, 8, 6, 4, 2, 1])
  pole: boolean;                   // Si otorga +1 punto por Pole Position
  fast: boolean;                   // Si otorga +1 punto por Vuelta Rápida
  seasons: Season[];               // Lista de campeonatos registrados
  drivers: Driver[];               // Padrón global de pilotos
  tracks: Track[];                 // Circuitos registrados
  races: Race[];                   // Historial de eventos / carreras disputadas
}
```

### 1. Campeonato (`Season`)
```typescript
interface Season {
  id: string;                      // Identificador único (timestamp o slug)
  name: string;                    // Nombre (ej. 'Campeonato Nacional 2026')
  year: string;                    // Año o temporada (ej. '2026')
  rounds: number;                  // Número total de rondas programadas (ej. 8)
  category?: string;               // Categoría técnica (ej. 'Box Stock', 'Open')
  desc?: string;                   // Descripción o reglamento oficial
  driverIds: string[];             // [CONTRATO CRÍTICO] Lista de IDs de pilotos inscritos en este torneo
}
```

### 2. Piloto (`Driver`)
```typescript
interface Driver {
  id: string;                      // Identificador único
  name: string;                    // Nombre completo
  nickname?: string;               // Apodo o alias en redes
  team?: string;                   // Escudería / Equipo
  number?: string;                 // Dorsal de carrera
  country?: string;                // País de origen
  photo?: string;                  // URL o Base64 de la fotografía
  bio?: string;                    // Biografía o notas
  career?: {                       // Estadísticas históricas base (anteriores al sistema)
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    poles: number;
    fast: number;
    titles: number;
  };
}
```

### 3. Carrera (`Race`)
```typescript
interface Race {
  id: string;                      // Identificador único
  seasonId: string;                // ID del campeonato al que pertenece
  trackId: string;                 // ID de la pista donde se compitió
  name: string;                    // Nombre de la fecha (ej. 'Gran Premio Apertura')
  date: string;                    // Fecha en formato 'YYYY-MM-DD'
  laps?: string;                   // Vueltas disputadas
  notes?: string;                  // Observaciones del evento
  results: RaceResult[];           // Resultados de la carrera ordenados por posición
}

interface RaceResult {
  driverId: string;                // ID del piloto participante
  position: number;                // Posición final (1, 2, 3...)
  pole?: boolean;                  // Si obtuvo la pole position
  fast?: boolean;                  // Si registró la vuelta rápida
  points?: number;                 // Puntos calculados para esta posición
}
```

---

## ⚖️ Reglas de Negocio del Sistema

### 5.1 Gestión de Participantes por Campeonato (`s.driverIds`)

> [!IMPORTANT]
> **Contrato de Aislamiento de Participantes:**
> Cada campeonato opera con su propia lista de `driverIds`. Nunca se debe iterar sobre la totalidad de `db.drivers` para clasificaciones o estadísticas de un campeonato en particular.

1. **Inscripción Inicial**: Al crear un campeonato desde el Panel de Administración, se seleccionan los pilotos que inician el torneo.
2. **Adición Tardía (Carreras en Marcha)**:
   - Un administrador puede añadir nuevos pilotos en cualquier momento desde **Editar Campeonato -> + Añadir piloto**.
   - Si se añade un piloto tras haberse corrido 2 carreras, dicho piloto **NO** recibe puntos retroactivos; aparece en la tabla con `0 pts` y `0 salidas` correspondientes a las fechas no corridas.
   - A partir de la fecha en que participe, acumula puntos con total normalidad.
3. **Función de Consulta Obligatoria**:
   - Para obtener los pilotos de un torneo, usar siempre:
     ```javascript
     const pilots = getSeasonDrivers(seasonId);
     ```
   - La función `standings(seasonId)` filtra automáticamente usando `getSeasonDrivers(seasonId)`.

---

### 5.2 Ciclo de Vida y Estados del Campeonato

La función `getSeasonStatus(season)` calcula el estado del torneo en base a las carreras registradas:

| Estado | Condición | Icono / Estilo | Comportamiento |
|---|---|---|---|
| **Próximamente** | `racesCount === 0` | ⏳ `proximamente` | No tiene resultados todavía; muestra aviso de espera. |
| **En curso** | `0 < racesCount < rounds` | 🟢 `enCurso` | Torneo activo; tabla de posiciones provisional. |
| **Finalizado** | `racesCount >= rounds` | 🏁 `finalizado` | Torneo completado; se corona automáticamente al 1.º como **Campeón**. |

- **Coronación Automática**: `championOf(seasonId)` devuelve el piloto en posición 1 de la tabla con al menos 1 participación cuando el campeonato está finalizado.
- **Títulos Históricos**: La función `countTitles(driverId)` suma los títulos base de `d.career.titles` más los campeonatos coronados por el sistema.

---

### 5.3 Sistema de Puntuación Automática

1. **Tabla de Puntos**: Por defecto `db.points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]`.
2. **Bonificaciones**:
   - `+1 punto` si `db.pole === true` y el piloto logró la pole.
   - `+1 punto` si `db.fast === true` y el piloto marcó la vuelta rápida.
3. **Cálculo**:
   ```javascript
   function pointsForPosition(position, pole = false, fast = false)
   ```
   La posición 1 recibe `db.points[0]`, la 2 recibe `db.points[1]`, etc.

---

### 5.4 Algoritmo de Rating Histórico (0–99 OVR)

El **Hall of Fame** clasifica a todos los pilotos históricos mediante la función `ratingFor(driver)` (escala 0 a 99), calculada en base a:
- **Tasa de Victorias**: Victorias / Salidas (15% máx).
- **Tasa de Podios**: Podios / Salidas (15% máx).
- **Efectividad de Puntuación**: Puntos totales ponderados (12% máx).
- **Promedio de Puntos por Carrera**: Pts / Salidas normalizado (15% máx).
- **Consistencia en Podio**: Podios / Salidas (15% máx).
- **Poles Históricas**: Normalizadas contra el récord de la liga (8% máx).
- **Vueltas Rápidas**: Normalizadas contra el récord de la liga (5% máx).
- **Experiencia / Temporadas Corridas**: Regularidad a lo largo de los años (15% máx).
- **Bonus por Título**: `+5 puntos` al rating por cada campeonato ganado.

---

### 5.5 Comparador Cara a Cara (Head to Head)

Permite enfrentar a dos pilotos seleccionados (`h2hPilotA` vs `h2hPilotB`):
- Compara: Campeonatos, Victorias, Podios, Salidas, Puntos Históricos, Poles, Vueltas Rápidas y Duelos Directos (quién terminó por delante en carreras donde ambos participaron).
- Resalta en verde (`.h2hWinner`) al piloto superior en cada rubro.

---

## 📊 Contratos y Reglas de Gráficos y Telemetría (Chart.js)

### 6.1 Prevención del Bucle de Expansión Infinita

> [!CAUTION]
> **REGLA DE ORO DE LOS CONTENEDORES DE CHART.JS:**
> Los elementos `<canvas>` que utilicen `responsive: true` y `maintainAspectRatio: false` **NUNCA** deben ser hijos directos de elementos flexibles o sin altura definida (`height: auto`). Hacerlo provoca un bucle recursivo de `ResizeObserver` donde el canvas expande al padre y la página crece a más de 10,000 píxeles.

**Estructura HTML obligatoria:**
```html
<div class="chartCard">
  <div class="chartHeader">...</div>
  <div class="chartContainer heroContainer">
    <canvas id="chartPosicionCamp"></canvas>
  </div>
</div>
```

**Regla CSS obligatoria (`style.css`):**
```css
.chartContainer {
  position: relative;
  width: 100%;
  height: 340px;
  min-height: 340px;
  max-height: 340px;
  overflow: hidden;
}

.chartContainer.heroContainer {
  height: 380px;
  min-height: 380px;
  max-height: 380px;
}
```

**Destrucción obligatoria de instancias previas (`analysis.js`):**
```javascript
if (champCharts[canvasId]) {
  champCharts[canvasId].destroy();
  champCharts[canvasId] = null;
}
champCharts[canvasId] = new Chart(ctx, config);
```

---

### 6.2 Estándares Visuales Obligatorios

Todas las gráficas deben adherirse a los siguientes principios de diseño:

1. **Eje Y Invertido para Posiciones**:
   - En gráficos de posición (`chartPosicionCamp`, `chartBattle`), el puesto 1 debe estar **arriba**:
     ```javascript
     scales: {
       y: {
         reverse: true,
         min: 1,
         max: maxDrivers,
         ticks: { stepSize: 1, precision: 0 }
       }
     }
     ```
2. **Puntos Circulares Destacados**:
   - Los marcadores de línea deben tener centro blanco y borde del color del piloto:
     ```javascript
     pointRadius: 4.5,
     pointHoverRadius: 7,
     pointBackgroundColor: '#ffffff',
     pointBorderColor: driverColor,
     pointBorderWidth: 2
     ```
3. **Leyenda Lateral Derecha**:
   - La leyenda se sitúa a la derecha en resoluciones de escritorio/tablet:
     ```javascript
     legend: {
       display: true,
       position: (window.innerWidth < 640 ? 'bottom' : 'right'),
       align: 'start',
       labels: { boxWidth: 12, boxHeight: 12, padding: 10 }
     }
     ```
4. **Paleta de Colores Consistente (`CHAMP_PALETTE`)**:
   - Se utiliza la paleta de 14 colores de alto contraste:
     `['#f59e0b', '#38bdf8', '#ef4444', '#10b981', '#a855f7', '#d97706', '#3b82f6', '#be123c', '#f97316', '#14b8a6', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16']`.
   - Cada piloto conserva exactamente el mismo color en todas las gráficas mediante `getDriverChampColor(idx)`.

---

### 6.3 Restricciones Estrictas de Texto

> [!WARNING]
> **RESTRICCIÓN PERMANENTE:**
> **Bajo ninguna circunstancia** incluir textos que digan `"Lap-by-Lap Position Graph"`. El título autorizado para la gráfica de evolución de posiciones es **`Evolución de Posiciones por Ronda`**.

---

## 🔒 Panel de Administración y Persistencia

### Modo Administrador
- Se activa agregando `?admin=1` a la URL (ej. `http://localhost:8085/?admin=1`) o iniciando sesión con Firebase Auth.
- La variable reactiva `isAdmin` habilita la pestaña `Admin` en la barra de navegación y los controles de edición/borrado.

### Persistencia y Sincronización
- La función central de guardado es `save()`:
  1. Serializa el objeto `db` y lo guarda en `localStorage` inmediatamente.
  2. Si el usuario está autenticado en Firebase, ejecuta `dbRef.set(db)` para replicar los cambios en tiempo real a todos los clientes.
  3. Ejecuta `render()` para refrescar la interfaz completa sin recargar la página.

### Herramientas de Datos
- **Exportar JSON**: Descarga una copia de respaldo completa con timestamp.
- **Importar JSON**: Restaura una base de datos externa validando su estructura (`initDbStructure()`).
- **Restaurar demo**: Carga el conjunto de datos de prueba predeterminado.

---

## 🛠️ Guía para Agentes y Desarrolladores Futuros

Al implementar nuevas funcionalidades o corregir errores en este repositorio, sigue estas directrices estrictas:

1. **Respetar la Arquitectura Vanilla**:
   - No introduzcas bundlers pesados (Webpack, Vite) ni librerías como Tailwind a menos que se solicite explícitamente. Todo debe ejecutarse de forma nativa en el navegador.
2. **Preservar el Contrato `driverIds`**:
   - Cualquier nueva vista que liste pilotos de un campeonato debe invocar `getSeasonDrivers(seasonId)`, nunca `db.drivers`.
3. **No Modificar los Wrappers `.chartContainer`**:
   - Mantén los `<canvas>` dentro de sus respectivos contenedores `.chartContainer`. No elimines las reglas de `height` fija ni `max-height` en `style.css`.
4. **Verificación Automatizada**:
   - Ejecuta las pruebas del sistema antes y después de hacer cambios:
     ```powershell
     node "C:\Users\pinai\.gemini\antigravity-ide\brain\c02f86dd-8d99-4b65-ae15-34f201e6fe20\scratch\test_charts.js"
     ```
5. **Comprobación en Navegador**:
   - Asegúrate de que `document.body.scrollHeight` no exceda los ~3,000 px al abrir la vista de análisis.
6. **Commits y Despliegues Git**:
   - La rama activa de producción es `main`.
   - Verifica el estado con `git status` y realiza commits con mensajes semánticos (`feat:`, `fix:`, `docs:`, `refactor:`).
