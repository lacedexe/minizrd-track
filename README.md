# MiniZRD 🏁
> **Plataforma Integral de Gestión de Campeonatos, Clasificaciones, Telemetría y Hall of Fame para Carreras RC Mini-Z.**

## Versión 0.4

La aplicación utiliza tres categorías oficiales con estadísticas independientes: **GT**, **GTP** y **LM GYRO**. La versión 0.4 incorpora categorías reales por piloto, rating sin bonificación de versatilidad, timeline y forma automática, fotos y reglamentos de campeonatos, líder/campeón derivados de la clasificación, pistas vinculadas, Hall of Fame de equipos, mejor dupla, records, versus, noticias y pronósticos derivados de resultados oficiales. El diseño responsive se aplica a las funciones completas de esta versión.

Principio de datos: carreras, pilotos, equipos, campeonatos y pistas son las fuentes únicas. Las estadísticas, rankings, rachas, noticias y proyecciones se calculan desde esas entidades y no se mantienen como copias manuales.

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
   - [5.6 Categorías Oficiales (GT, GTP y LM GYRO) y Reglas de Campeonato](#56-categorías-oficiales-gt-y-gtp-y-reglas-de-campeonato)
   - [5.7 Sistema de Circuitos y Perfiles de Pista](#57-sistema-de-circuitos-y-perfiles-de-pista)
   - [5.8 Sección Último Evento con Podio 3D Metálico (Solo en Inicio)](#58-sección-último-evento-con-podio-3d-metálico-solo-en-inicio)
   - [5.9 Temas de Campeón y categorías](#59-temas-de-campeón-oro-rojo-diamante-diamante-y-versatilidad)
   - [5.10 Hall of Fame Multi-Categoría (General, GT, GTP, LM GYRO y Equipos)](#510-hall-of-fame-multi-categoría-general-gt-gtp)
   - [5.11 Sistema Oficial de Escuderías y Rivalidad Interna](#511-sistema-oficial-de-escuderías-y-rivalidad-interna)
   - [5.12 Primer Piloto por Rendimiento y Jefe de Equipo Manual](#512-primer-piloto-por-rendimiento-y-jefe-de-equipo-manual)
   - [5.13 Campeonatos en Equipo en el Perfil del Piloto](#513-campeonatos-en-equipo-en-el-perfil-del-piloto)
   - [5.14 Estándares de Formato Panorámico y Subida de Logos](#514-estándares-de-formato-panorámico-y-subida-de-logos)
   - [5.15 Identidad Visual MiniZRD y Tema Claro / Oscuro Unificado](#515-identidad-visual-minizrd-y-tema-claro--oscuro-unificado)
6. [Contratos y Reglas de Gráficos y Telemetría (Chart.js)](#-contratos-y-reglas-de-gráficos-y-telemetría-chartjs)
   - [6.1 Prevención del Bucle de Expansión Infinita](#61-prevención-del-bucle-de-expansión-infinita)
   - [6.2 Estándares Visuales Obligatorios](#62-estándares-visuales-obligatorios)
   - [6.3 Restricciones Estrictas de Texto](#63-restricciones-estrictas-de-texto)
7. [Panel de Administración y Persistencia](#-panel-de-administración-y-persistencia)
8. [Guía para Agentes y Desarrolladores Futuros](#-guía-para-agentes-y-desarrolladores-futuros)

---

## 🚀 Descripción General

**MiniZRD** es una aplicación web SPA (Single Page Application) diseñada específicamente para la administración, seguimiento y análisis de ligas de automovilismo a escala RC Mini-Z.

Permite a organizadores y pilotos:
- Administrar múltiples campeonatos independientes en paralelo (activos o históricos).
- Gestionar listas de participantes específicos por campeonato, permitiendo inscripciones tardías sin distorsionar carreras pasadas.
- Registrar resultados de carreras con asignación automática de puntos y poles.
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
  site: string;                    // Nombre de la pista / liga (ej. 'MiniZRD')
  activeSeason: string | null;     // ID del campeonato activo seleccionado
  points: number[];                // Puntuación por posición (ej. [25, 18, 15, 12, 10, 8, 6, 4, 2, 1])
  pole: boolean;                   // Si otorga +1 punto por Pole Position
  seasons: Season[];               // Lista de campeonatos registrados
  drivers: Driver[];               // Padrón global de pilotos
  teams: Team[];                   // Escuderías / Equipos oficiales registrados
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
  category: 'GT' | 'GTP';          // Categoría técnica obligatoria ('GT' o 'GTP')
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
  teamId?: string | null;          // ID de la escudería oficial asignada
  team?: string;                   // Nombre de la escudería / Equipo
  number?: string;                 // Dorsal de carrera
  country?: string;                // País de origen
  photo?: string;                  // URL o Base64 de la fotografía
  bio?: string;                    // Biografía o notas
  career?: {                       // Estadísticas históricas base
    points: number;
    starts: number;
    wins: number;
    podiums: number;
    poles: number;
    fast: number;
    titles: number;
    gtTitles?: number;             // Títulos base en categoría GT
    gtpTitles?: number;            // Títulos base en categoría GTP
    teamTitles?: number;           // Títulos base en campeonatos de escudería
  };
}
```

### 3. Carrera (`Race`)
```typescript
interface Race {
  id: string;                      // Identificador único
  seasonId: string;                // ID del campeonato al que pertenece
  trackId: string;                 // [OBLIGATORIO] ID de la pista donde se compitió
  category?: 'GT' | 'GTP';         // Heredada automáticamente de la temporada
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
  points?: number;                 // Puntos calculados para esta posición
}
```

### 4. Pista o Circuito (`Track`)
```typescript
interface Track {
  id: string;                      // Identificador único
  name: string;                    // Nombre oficial del trazado
  country?: string;                // País o localidad
  length?: string;                 // Longitud en metros (ej. '32.5 m')
  image?: string;                  // Imagen del circuito (URL o Base64)
  record?: string;                 // Récord histórico previo
  recordGT?: TrackRecord | null;   // Récord oficial de vuelta en categoría GT
  recordGTP?: TrackRecord | null;  // Récord oficial de vuelta en categoría GTP
}

interface TrackRecord {
  driverId: string;                // ID del piloto que ostenta la vuelta récord
  time: string;                    // Tiempo de vuelta en segundos (ej. '5.997')
  seasonName?: string;             // Temporada en la que se marcó
  round?: string;                  // Ronda específica
}
```

### 5. Escudería / Equipo (`Team`)
```typescript
interface Team {
  id: string;                      // Identificador único (ej. 'team_1740000000')
  name: string;                    // Nombre oficial de la escudería
  country?: string;                // País de origen
  logo?: string;                   // URL o DataURL (PNG transparente o JPEG a 600px)
  bio?: string;                    // Historia o reseña del equipo
  driverIds?: string[];            // IDs de los pilotos asignados oficialmente
  bossDriverId?: string | null;     // Jefe de Equipo elegido manualmente por el administrador
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
- **Poles Históricas**: Normalizadas contra el récord de la liga (13% máx).
- **Experiencia / Temporadas Corridas**: Regularidad a lo largo de los años (15% máx).
- **Bonus por Título**: `+5 puntos` al rating por cada campeonato ganado.

---

### 5.5 Comparador Cara a Cara (Head to Head)

Permite enfrentar a dos pilotos seleccionados (`h2hPilotA` vs `h2hPilotB`):
- Compara: Campeonatos, Victorias, Podios, Salidas, Puntos Históricos, Poles y Duelos Directos (quién terminó por delante en carreras donde ambos participaron).
- Resalta en verde (`.h2hWinner`) al piloto superior en cada rubro.

---

### 5.6 Categorías Oficiales (GT, GTP y LM GYRO) y Reglas de Campeonato

MiniZRD opera con tres categorías técnicas oficiales: **GT** (`🏎️ GT`), **GTP** (`⚡ GTP`) y **LM GYRO** (`🟢 LM GYRO`):

1. **Obligatoriedad en la Creación de Campeonatos**:
   - Todo campeonato debe pertenecer estrictamente a `GT`, `GTP` o `LM_GYRO`.
   - En el panel de administración, la categoría se selecciona mediante radio buttons dinámicos con estilos y badges distintivos.
2. **Herencia Automática en Carreras**:
   - Al registrar una carrera dentro de un campeonato, esta adopta automáticamente la categoría del torneo (`r.category = season.category`).
   - El administrador no necesita volver a especificar la categoría en cada fecha.
3. **Aislamiento Estadístico**:
   - Las estadísticas de victorias, podios, carreras y campeonatos se computan separadamente para perfiles y rankings de categoría cuando corresponde.

---

### 5.7 Sistema de Circuitos y Perfiles de Pista

1. **Selección Obligatoria de Pista por Carrera**:
   - Al registrar o editar cualquier carrera oficial, la selección de la pista es obligatoria (`raceTrack`). Si se omite, el sistema bloquea el guardado.
2. **Contador Dinámico de Carreras**:
   - Cada circuito registra dinámicamente el número de carreras oficiales realizadas en él (`getTrackStats(trackId)`).
   - No se incrementa al editar una carrera existente. Si una carrera es eliminada, el contador se descuenta de inmediato.
3. **Perfil Estadístico de Pista (`showTrackProfile(trackId)`)**:
   - Muestra imagen, país y longitud del circuito.
   - Tarjeta destacada con el piloto con más victorias en la pista (`trackTopWinnerCard`).
   - Récords oficiales de vuelta rápida separados por categoría (`recordGT`, `recordGTP` y `recordLMGYRO`) con piloto titular, tiempo, campeonato y ronda.
4. **Regla de Récord vs Pole Position**:
   - La asignación de la **Pole Position** en una carrera **NO** modifica el récord de vuelta de la pista. El récord de pista únicamente se actualiza cuando un piloto marca la vuelta más rápida oficial.

---

### 5.8 Sección Último Evento con Podio 3D Metálico (Solo en Inicio)

> [!IMPORTANT]
> **Exclusividad Estricta de Inicio:**
> Esta sección se renderiza **exclusivamente** en la pestaña **INICIO** (`#inicio` -> `#last`). Las pestañas de Campeonato, Resultados, Admin y el modal de ronda conservan sus tablas completas estándar.

1. **Encabezado Hero**:
   - **Eyebrow**: `ÚLTIMO EVENTO` en rojo deportivo (#ff3b30).
   - **Título**: `Último resultado` en gran formato.
   - **Ronda y Fecha**: Cálculo cronológico dinámico (ej. `Ronda 6 · Gran Premio López Track`), fecha formateada (`10/09/2026`) y vueltas disputadas.
   - **Badges**:
     - `🏁 [Pista]`: Clickeable para abrir el perfil del circuito.
     - `⏱️ Récord: [Tiempo] s`: Récord de vuelta de la pista según la categoría de la carrera.
     - `👤 [N] pilotos`: Total de competidores participantes.
     - `🏎️ GT` / `⚡ GTP` / `🟢 LM GYRO`: Badge oficial de la categoría.
2. **Podio Deportivo 3D Metálico**:
   - **Distribución Visual Obligatoria**:
     ```text
                  🥇 1.º
             ┌─────────────┐
        🥉 3.º│             │  🥈 2.º
      ┌───────┤             ├────────┐
      │   3   │      1      │    2   │
     ```
     - **3.º (Izquierda)**: Pedestal de bronce metálico (85px), tarjeta bronce (#b45309), puntos e insignia `🏁 POLE` (si aplica).
     - **1.º (Centro, más alto)**: Pedestal dorado metálico (140px), corona dorada `👑`, tarjeta dorada con halo brillante (#ffd700), puntos e insignia `🏁 POLE` (si aplica).
     - **2.º (Derecha)**: Pedestal plateado metálico (105px), tarjeta plata (#cbd5e1), puntos e insignia `🏁 POLE` (si aplica).
   - **Pedestales con Bisel Superior y Laureles SVG**: Cada pedestal incluye su número enmarcado entre ramas de laurel vectoriales SVG en relieve metálico.
3. **Tabla de Resultados Restantes (P4 en adelante)**:
   - **Exclusión de los 3 primeros**: Los pilotos del podio (1.º, 2.º y 3.º) **NO** se incluyen en la tabla.
   - **Comienzo en Posición 4**: La tabla muestra estrictamente las posiciones 4 en adelante (4, 5, 6, etc.).
   - **Columnas**:
     - `POS`: Posición final.
     - `PILOTO`: Avatar, nombre en negrita y escudería (clickeable a perfil).
     - `PTS`: Puntos oficiales obtenidos.
     - `EXTRA`: Insignia dorada `🏁 POLE` si ese piloto obtuvo la pole, o guion `—`.

---

### 5.9 Temas de Campeón y categorías

Los perfiles individuales de piloto adaptan dinámicamente su diseño según los campeonatos oficiales ganados:

1. **Temas Cromáticos de Campeón**:
   - **Campeón GT**: Tema Dorado (`.profileChampionGold`) con banner dorado `🏆 CAMPEÓN GT`.
   - **Campeón GTP**: Tema Rojo Diamante (`.profileChampionRedDiamond`) con banner rojo rubí `⚡ CAMPEÓN GTP`.
   - **Campeón LM GYRO**: Banner verde propio de la categoría.
   - **Campeón multicategoría**: Tema Diamante con las categorías ganadas.
2. **Estadísticas Especiales en Perfil**:
   - **Circuito con más victorias**: Muestra la pista favorita del piloto con el número exacto de triunfos.
   - **Dónde es más fuerte (1 a 10)**: calcula automáticamente la fuerza solamente en las categorías que el piloto corre.
   - Participar en varias categorías no agrega puntos ni bonificaciones al rating.
   - **Sección de Récords de Pista**: Si el piloto ostenta récords vigentes de pista, se listan indicando pista, tiempo y categoría (sin incluir nombre de torneo ni ronda).

---

### 5.10 Hall of Fame Multi-Categoría y Equipos

El **Hall of Fame** incorpora navegación por pestañas para evaluar el rendimiento histórico:

- **TOP GENERAL**: Evalúa la trayectoria global acumulada de todos los pilotos.
- **TOP HISTÓRICO GT**: Clasifica únicamente según estadísticas y campeonatos disputados en la categoría GT.
- **TOP HISTÓRICO GTP**: Clasifica únicamente según estadísticas y campeonatos disputados en la categoría GTP.
- **TOP HISTÓRICO LM GYRO**: Clasifica exclusivamente los resultados LM GYRO.
- **EQUIPOS**: clasifica el rendimiento histórico de escuderías, priorizando resultados y eficiencia.
- Ningún ranking concede una bonificación por participar en más categorías.

---

### 5.11 Sistema Oficial de Escuderías y Rivalidad Interna

El sistema integra un módulo completo de escuderías oficiales (`#equipos`) con soporte multicategoría independiente y administración centralizada:

1. **Gestión y Configuración Exclusiva de Administrador**:
   - Desde **Equipos -> ✏️ Editar**, el administrador puede configurar el nombre, país, historia y logo de la escudería.
   - Dispone de la función **“AGREGAR PILOTO A ESTE EQUIPO”**, permitiendo seleccionar pilotos del padrón global e incorporarlos de inmediato.
   - Permite agregar o remover pilotos con reflejo instantáneo en todas las vistas del sistema.
2. **Pilotos del Equipo en Todas las Categorías (Multicategoría Independiente)**:
   - Una escudería **NO** deja de existir ni se separa porque sus pilotos compitan en categorías distintas.
   - Si el Piloto A compite en GT y el Piloto B en GTP, ambos pertenecen a la misma escudería y puntúan conjuntamente para el equipo.
3. **Módulo de Rivalidad Interna entre Compañeros (`renderTeammateRivalryHtml`)**:
   - Dentro del perfil de la escudería (`showTeamProfile`), se despliega una comparativa cara a cara exclusiva entre los pilotos oficiales del equipo.
   - Permite alternar la comparativa entre: **🌐 Global**, **🏎️ GT** y **⚡ GTP**.
   - Evalúa: Puntos con el equipo, Victorias, Podios, Poles, Carreras disputadas y Duelos directos terminados por delante.

---

### 5.12 Primer Piloto por Rendimiento y Jefe de Equipo Manual

El sistema mantiene separados el orden deportivo y el cargo oficial del equipo:

1. **Primer y Segundo Piloto por Rendimiento (`sortTeamDriversByPerformance`)**:
   - El sistema analiza las estadísticas oficiales acumuladas exclusivamente con esa escudería.
   - El orden se determina por puntos, victorias, podios, poles, carreras disputadas, rating histórico, puntos históricos y, finalmente, orden alfabético.
   - Si cambian los resultados, puede cambiar automáticamente quién aparece como **Primer Piloto**, sin modificar el Jefe de Equipo.
2. **Jefe de Equipo Manual (`bossDriverId`)**:
   - El administrador elige desde el perfil o el editor de la escudería cuál de sus pilotos oficiales ocupa el cargo.
   - Puede designarse tanto al **Primer Piloto** como al **Segundo Piloto** y también dejar el cargo sin asignar.
   - La designación no depende de rating, puntos, victorias, estadísticas ni posición en el orden deportivo.
3. **Visibilidad**:
   - Cada piloto conserva su badge deportivo (**Primer Piloto** o **Segundo Piloto**).
   - Sólo el piloto seleccionado muestra además el badge dorado **`🏆 JEFE DE EQUIPO`** en el perfil, la rivalidad interna y las tarjetas públicas.

---

### 5.13 Campeonatos en Equipo en el Perfil del Piloto

Cada piloto cuenta dentro de su perfil (`profile(id)`) con la sección oficial **`🏎️🏆 CAMPEONATOS EN EQUIPO`**:

1. **Sincronización Automática con Campeonatos**:
   - Se vincula directamente con los torneos completados donde la escudería del piloto se coronó campeona (`championOf(seasonId, 'team')`).
   - Todos los pilotos inscritos como participantes en ese campeonato y pertenecientes a la escudería reciben automáticamente el título en su perfil sin intervención manual.
2. **Diferenciación Rigurosa de Títulos**:
   - Los contadores distinguen claramente entre **`CAMP. INDIVIDUALES`** y **`CAMP. EN EQUIPO`** tanto en la cabecera del perfil como en la cuadrícula de estadísticas.
3. **Contenido de la Casilla**:
   - Nombre oficial del campeonato.
   - Temporada / Año y categoría técnica (`GT` o `GTP`).
   - Escudería campeona con logo clickeable para abrir el perfil del equipo.
   - Aporte del piloto (puntos y carreras corridas en el torneo).
   - Insignia oficial dorada **`🏆 CAMPEÓN`**.

---

### 5.14 Estándares de Formato Panorámico y Subida de Logos

Para evitar que los logos de las escuderías se recorten o se visualicen diminutos dentro de marcos cuadrados, el sistema utiliza estándares panorámicos:

1. **Dimensiones de Recuadros**:
   - **Tarjetas Públicas de Escudería (`.teamLogo`)**: Formato banner de `110x48px` con esquinas redondeadas (`10px`).
   - **Modal de Perfil de Escudería (`.teamHeroLogo`)**: Formato banner de `170x72px` con relieve y esquinas redondeadas (`14px`).
   - **Panel Administrativo**: Miniaturas tipo banner de `84x38px`.
   - **Línea de Tiempo y Campeonatos en Equipo**: Miniaturas panorámicas de `44x24px` y `38x20px`.
2. **Reglas de Renderizado y Ajuste**:
   - `object-fit: contain` con padding ultra-bajo (`2px 4px`), garantizando que la imagen ocupe prácticamente el 100% del recuadro sin sufrir recortes laterales y sin verse pequeña.
   - Fondo placa oscura unificado (`#0d121c` en modo oscuro y `#0f172a` en modo claro) para que los logos de carreras con tipografías blancas, doradas o de colores resalten con contraste óptimo.
3. **Subida y Procesamiento de Imágenes (`fileToDataURL`)**:
   - Si el archivo subido es **PNG**, el sistema conserva su canal alfa nativo (`image/png`) para preservar fondos transparentes, evitando que se convierta en JPEG con fondo negro.
   - Resolución máxima ampliada a `600px` con calidad 0.88 para garantizar nitidez sin sobrecargar la base de datos.
   - Vistas previas en vivo (`previewNewTeamLogo` y `previewEditTeamLogo`) renderizadas directamente dentro de la clase oficial `.teamLogo`.

---

### 5.15 Identidad Visual MiniZRD y Tema Claro / Oscuro Unificado

1. **Renombrado y Marca Oficial MiniZRD**:
   - Se estandarizó la identidad eliminando cualquier denominación anterior ("López Track"), unificando todos los títulos y cabeceras bajo **MiniZRD**.
   - Logotipo oficial renovado con combinación deportiva rojo y blanco de alta visibilidad.
   - Favicon oficial de pestaña (`favicon_v1.png`) configurado en el navegador para una experiencia de aplicación web completa.
2. **Soporte y Auditoría de Tema Claro (`body.light`)**:
   - Adaptación completa de contraste en modales, tarjetas, buscadores y Hall of Fame.
   - Placas oscuras pulidas para logos en modo claro, garantizando que el diseño mantenga estética de competición profesional en ambos modos.

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

### Modo Administrador y Seguridad
- **Autenticación Estricta**: La variable `isAdmin` requiere autenticación real mediante Firebase Auth (`firebase.auth().currentUser`). No se puede eludir mediante parámetros de URL.
- **Botón de Acceso (🔒)**: Los administradores inician sesión con su correo y contraseña haciendo clic en el icono del candado en la barra superior.
- **API Key Pública de Firebase**: Las API Keys de Firebase son identificadores de proyecto de Google y no secretos de servidor. La seguridad real de la base de datos reside en las **Reglas de Seguridad (Security Rules)** de Firebase Realtime Database (`.write: auth != null`), bloqueando cualquier escritura a usuarios no autenticados.

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
   - Ejecuta las suites de pruebas antes y después de hacer cambios:
     ```powershell
     # Verificación del Podio y sección Inicio
     node "C:\Users\pinai\.gemini\antigravity-ide\brain\8fc4531c-c8c7-41f7-b4be-db9f75109180\scratch\test_podio_inicio.js"

     # Verificación de Actualización 3.0 (Categorías, Pistas, Hall of Fame)
     node "C:\Users\pinai\.gemini\antigravity-ide\brain\8fc4531c-c8c7-41f7-b4be-db9f75109180\scratch\test_actualizacion_3.js"

     # Verificación de Gráficos y Telemetría
     node "C:\Users\pinai\.gemini\antigravity-ide\brain\c02f86dd-8d99-4b65-ae15-34f201e6fe20\scratch\test_charts.js"
     ```
5. **Comprobación en Navegador**:
   - Asegúrate de que `document.body.scrollHeight` no exceda los ~3,000 px al abrir la vista de análisis.
6. **Commits y Despliegues Git**:
   - La rama activa de producción es `main`.
   - Verifica el estado con `git status` y realiza commits con mensajes semánticos (`feat:`, `fix:`, `docs:`, `refactor:`).
