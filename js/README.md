# Gestión de Pastas Pro

PWA para administrar ventas, pedidos, clientes y stock de un negocio de pastas.  
Datos sincronizados en Firebase · Hosteable gratis en GitHub Pages.

---

## Estructura de archivos

```
/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── storage.js
    ├── whatsapp.js
    └── firebase-config.js   ← VOS completás este archivo
```

---

## PASO 1 — Crear proyecto en Firebase (5 minutos)

1. Entrá a **https://console.firebase.google.com**
2. Hacé click en **"Agregar proyecto"**
3. Poné un nombre (ej: `pastas-app`) → Siguiente → Desactivar Google Analytics → **Crear proyecto**
4. En el menú izquierdo: **Firestore Database** → **Crear base de datos**
   - Elegí **"Comenzar en modo de prueba"** → Siguiente → Elegí la región `southamerica-east1` → **Listo**
5. En el menú izquierdo: **Configuración del proyecto** (ícono de engranaje) → **Tus apps** → click en `</>`
6. Registrá la app con cualquier nombre (ej: `pastas-web`) → **Registrar app**
7. Copiá el objeto `firebaseConfig` que aparece — tiene este formato:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "pastas-app.firebaseapp.com",
  projectId: "pastas-app",
  storageBucket: "pastas-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

8. Abrí el archivo **`js/firebase-config.js`** y pegá tus valores reemplazando los `"REEMPLAZAR"`.

---

## PASO 2 — Reglas de seguridad en Firestore

En la consola de Firebase → **Firestore** → pestaña **Reglas** → pegá esto y publicá:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Estas reglas son para uso personal (una sola persona). Si en el futuro usás la app con más gente, configurá autenticación.

---

## PASO 3 — Subir a GitHub Pages

### Si es la primera vez con GitHub:

1. Creá una cuenta en **https://github.com** (gratis)
2. Instalá **GitHub Desktop** desde **https://desktop.github.com** (más fácil que la terminal)

### Crear el repositorio:

1. Abrí GitHub Desktop → **File → New Repository**
   - Name: `pastas-app`
   - Local Path: la carpeta donde tenés los archivos del proyecto
   - ✅ Initialize this repository with a README
   - → **Create Repository**

2. Copiá todos los archivos del proyecto dentro de esa carpeta (si no están ya)

3. En GitHub Desktop vas a ver todos los archivos en "Changes"
   - Summary: `primer commit`
   - → **Commit to main**
   - → **Publish repository** (arriba a la derecha)
   - Desmarcar "Keep this code private" si querés que sea público (necesario para GitHub Pages gratis)
   - → **Publish Repository**

### Activar GitHub Pages:

1. Abrí **https://github.com/TU-USUARIO/pastas-app**
2. → **Settings** → **Pages** (menú izquierdo)
3. En "Source": seleccioná **Deploy from a branch**
4. Branch: **main** → folder: **/ (root)** → **Save**
5. Esperá 1-2 minutos → tu app va a estar en:
   ```
   https://TU-USUARIO.github.io/pastas-app
   ```

### Para actualizar la app en el futuro:

1. Modificá los archivos en tu carpeta local
2. Abrí GitHub Desktop → vas a ver los cambios
3. Summary: descripción del cambio → **Commit to main** → **Push origin**
4. En 1-2 minutos los cambios se reflejan en la web

---

## Cómo funciona la sincronización

```
Celular A                    Firebase (nube)              Celular B
   │                               │                          │
   ├─ Cargás una venta ────────────►                          │
   │                               ├──── sync automático ─────►
   │                               │                          │
   │◄──── sync al abrir la app ────┤                          │
```

- **Offline:** si no hay internet, la app funciona igual con los datos locales
- **Online:** cada cambio se guarda en Firebase automáticamente
- **Botón sync (↻)** en el header: fuerza una sincronización manual desde la nube

---

## Datos que se guardan en Firebase

| Colección   | Qué contiene                              |
|-------------|-------------------------------------------|
| `clientes`  | Datos, deuda, historial de movimientos    |
| `productos` | Stock, precios minorista y mayorista      |
| `ventas`    | Transacciones con items, método y canal   |
| `pedidos`   | Encargos con fecha de entrega y estado    |

---

## Límites del plan gratuito de Firebase

| Recurso          | Límite gratuito       | Para este negocio         |
|------------------|-----------------------|---------------------------|
| Lecturas/día     | 50.000                | Más que suficiente        |
| Escrituras/día   | 20.000                | Más que suficiente        |
| Almacenamiento   | 1 GB                  | Años de datos             |
| Costo            | **$0**                | Siempre gratis a esta escala |

---

## Preguntas frecuentes

**¿Puedo usar la app desde el celular?**  
Sí. Entrá a la URL de GitHub Pages desde el navegador del celular → menú del navegador → "Agregar a pantalla de inicio". Funciona como una app instalada.

**¿Qué pasa si pierdo el teléfono?**  
Todos los datos están en Firebase. Entrás desde cualquier dispositivo a la misma URL y están todos.

**¿Puedo tener varios dispositivos sincronizados?**  
Sí, pero los cambios se sincronizan al abrir la app o al tocar el botón ↻. No es tiempo real simultáneo (para eso se necesitaría WebSockets, que está en el plan de pago de Firebase).
