# Auditoría de seguridad de MiniZRD

Fecha: 22 de septiembre de 2026  
Alcance: frontend estático, Firebase Authentication, Realtime Database, persistencia local, importación/exportación, imágenes y dependencias CDN.

## Resumen ejecutivo

La aplicación no contiene una contraseña ni una clave privada incrustada. La `apiKey` de Firebase visible en `script.js` identifica el proyecto, pero no autoriza operaciones por sí sola. La barrera de seguridad real son Firebase Authentication, las reglas de Realtime Database y App Check.

El riesgo principal es que el cliente considera administrador a cualquier usuario autenticado. La interfaz no distingue un usuario autenticado común de un administrador autorizado. La autorización de escritura debe imponerse en el servidor mediante una custom claim, por ejemplo `minizrdAdmin: true`, y no solamente mediante `auth != null`.

La lectura pública de `/minizrd_data` está habilitada actualmente (HTTP 200 sin autenticación), mientras que la raíz de la base devuelve HTTP 401. Esto es compatible con un portal público, pero significa que nombres, fotografías, resultados y demás información publicada deben considerarse datos públicos.

## Hallazgos

### Crítico — autorización administrativa dependiente del cliente

- Código observado: `isAdmin = !!user`.
- Impacto: cualquier cuenta que pueda autenticarse recibe la interfaz administrativa. Si las reglas remotas usan solamente `auth != null`, esa cuenta también podría reemplazar toda la base porque la aplicación escribe con `dbRef.set(db)`.
- Corrección preparada localmente: `database.rules.json` exige `auth.token.minizrdAdmin === true`.
- Pendiente obligatorio: asignar la custom claim a la cuenta administrativa mediante Firebase Admin SDK y después desplegar las reglas. No desplegar antes de configurar la cuenta para evitar bloquear al administrador legítimo.

### Alto — superficie de XSS DOM y contenido persistente

- La aplicación usa extensivamente `innerHTML`, HTML generado con plantillas y controladores `onclick` inline.
- Un registro malicioso procedente de Firebase o de una importación JSON podría alcanzar un contexto HTML o JavaScript si no se valida correctamente.
- Refuerzo local aplicado:
  - validación recursiva antes de aceptar Firebase, importar JSON o guardar;
  - rechazo de claves de prototype pollution;
  - identificadores limitados a caracteres seguros;
  - rechazo de marcado HTML en datos persistidos;
  - límites de tamaño y formato;
  - URLs de imágenes filtradas por protocolo y tipo.
- Deuda pendiente: migrar gradualmente los `onclick` inline a `addEventListener` y construir contenido no confiable con `textContent`/`createElement`. Esto permitirá retirar `'unsafe-inline'` de CSP.

### Alto — cadena de suministro CDN

- Chart.js se cargaba sin versión fija, por lo que una actualización futura podía cambiar el código ejecutado sin revisión.
- Firebase estaba fijado en 10.4.0, muy por detrás de la versión actual revisada.
- Refuerzo local aplicado:
  - Chart.js fijado en 4.5.1;
  - Firebase actualizado a 12.19.0 manteniendo la API compat;
  - hashes SHA-384 SRI y `crossorigin="anonymous"` en los cuatro scripts externos.

### Medio — archivos e importaciones sin límites suficientes

- Las imágenes podían pasar al sistema aunque el navegador no lograra decodificarlas.
- Un JSON o una imagen muy grande podía consumir memoria, inflar LocalStorage o aumentar excesivamente Realtime Database.
- Refuerzo local aplicado:
  - imágenes limitadas a JPG, PNG o WebP y 8 MB;
  - dimensión máxima de 12.000 píxeles por lado y salida reescalada a 600 píxeles;
  - el error de decodificación ya no conserva el archivo original;
  - JSON limitado a 30 MB y validado antes de sustituir el estado.

### Medio — login y persistencia de sesión

- Se mostraban mensajes crudos de Firebase, útiles para enumeración de cuentas o reconocimiento del proveedor.
- La persistencia predeterminada podía conservar una sesión administrativa más tiempo del deseado en equipos compartidos.
- Refuerzo local aplicado:
  - mensajes genéricos al usuario y detalles técnicos solamente en consola;
  - persistencia `SESSION`, limitada a la sesión de la pestaña/navegador;
  - atributos `autocomplete` correctos para gestores de contraseñas.

### Medio — App Check no configurado

- Authentication y Rules controlan identidad y autorización, pero no distinguen la aplicación legítima de scripts automatizados que llamen directamente a Firebase.
- Recomendación: registrar reCAPTCHA Enterprise para la aplicación web, integrar App Check, observar métricas y después activar enforcement para Realtime Database.

### Medio — cabeceras HTTP dependen del hosting

- Se añadió una CSP compatible mediante `<meta>`, junto con una política de referrer. Esta capa restringe recursos, conexiones, objetos y formularios.
- Una CSP fuerte todavía no es posible porque la aplicación usa eventos y estilos inline.
- `frame-ancestors`, HSTS, `X-Content-Type-Options`, `Permissions-Policy` y una CSP efectiva como cabecera deben configurarse en el proveedor de hosting. GitHub Pages no permite controlar todas estas cabeceras directamente.

### Bajo — configuración pública de Firebase

- La `apiKey` del frontend no es una contraseña y no debe moverse a un archivo “secreto” esperando que eso proteja la base.
- Debe verificarse en Google Cloud que la clave solo permita APIs de Firebase necesarias y que tenga restricciones HTTP Referrer para los dominios oficiales.

## Pasos manuales obligatorios en Firebase

1. Crear/asignar la custom claim `minizrdAdmin: true` exclusivamente al UID administrador usando Firebase Admin SDK en un entorno seguro.
2. Cerrar sesión y volver a entrar para renovar el token.
3. Probar `database.rules.json` en Firebase Rules Playground o Emulator Suite.
4. Desplegar las reglas con Firebase CLI solamente después de validar la cuenta administrativa.
5. Confirmar que una sesión anónima puede leer `minizrd_data`, pero no escribir.
6. Confirmar que una cuenta autenticada sin la claim tampoco puede escribir.
7. Activar protección contra enumeración de correo y una política de contraseñas en Firebase Authentication.
8. Configurar App Check con reCAPTCHA Enterprise: primero monitorizar y después activar enforcement.
9. Restringir la API key a las APIs Firebase requeridas y a los dominios de producción.

## Criterios de verificación

- Ningún usuario sin custom claim puede ejecutar una escritura aceptada por Realtime Database.
- Los datos públicos siguen cargando sin iniciar sesión.
- El administrador autorizado puede crear, editar y eliminar datos después de reautenticarse.
- Un JSON con HTML, claves peligrosas, IDs inválidos o tamaño excesivo es rechazado.
- SVG, archivos no-imagen e imágenes excesivas son rechazados.
- Si un CDN entrega contenido diferente al auditado, SRI bloquea su ejecución.
- La consola del navegador no muestra violaciones CSP durante los flujos normales.

## Estado de publicación

Estos cambios permanecen únicamente en la copia local. No se han enviado a GitHub ni se han desplegado reglas en Firebase.
