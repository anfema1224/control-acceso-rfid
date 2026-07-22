# Control de acceso ESP32 + RC522

Sistema local para registrar tarjetas RFID, autorizar accesos, administrar
funcionarios, definir horarios y consultar graficos de movimientos desde una
pagina web.

## Componentes

- ESP32
- Lector RFID RC522
- Pantalla LCD 20x4 con modulo I2C
- Tarjetas o llaveros MIFARE de 13.56 MHz
- Rele de 3.3 V compatible o modulo con entrada logica compatible
- Fuente adecuada para la cerradura (no alimentar la cerradura desde el ESP32)

## Conexion RC522 al ESP32

| RC522 | ESP32 |
|---|---|
| 3.3V | 3V3 |
| GND | GND |
| SDA/SS | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 4 |

El rele se conecta al GPIO 27. El RC522 debe alimentarse solamente con 3.3 V.

## Conexion LCD 20x4 I2C al ESP32

| LCD I2C | ESP32 |
|---|---|
| VCC | 5V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

La direccion I2C comun es `0x27`. Si la pantalla no muestra texto, pruebe
`0x3F` en `LCD_ADDRESS` dentro del firmware. Ajuste tambien el potenciometro
azul del modulo I2C para regular el contraste.

## Ejecutar el servidor

Se requiere Node.js 18 o posterior.

```powershell
node server.js
```

Abrir `http://localhost:3000`. Desde otro equipo de la misma red se debe usar
la IP del computador, por ejemplo `http://192.168.1.50:3000`.

El archivo `data/database.json` se crea automaticamente.

## Acceso al panel

El usuario y la contrasena inicial del panel son:

```text
Usuario: admin
Contrasena: Fatima2026*
```

Para cambiarlos al iniciar el servidor:

```powershell
$env:ADMIN_USER="colegio"; $env:ADMIN_PASSWORD="NuevaClaveSegura"; node server.js
```

El ESP32 no usa esta contrasena. Solo protege la pagina, los funcionarios, las
tarjetas, los horarios y el historial.

## Identidad institucional

El panel usa como referencia publica el nombre Colegio Nuestra Senora de Fatima
Pereira, el lema Ciencia y Virtud y la frase institucional de formacion
publicada por la Policia Nacional de Colombia.

## Preparar el ESP32

1. Instalar en Arduino IDE el soporte para placas ESP32.
2. Instalar las librerias `MFRC522`, `ArduinoJson` y `LiquidCrystal_I2C`.
3. Abrir `firmware/control_acceso/control_acceso.ino`.
4. Cambiar `WIFI_SSID`, `WIFI_PASSWORD` y `SERVER_URL`.
5. Seleccionar la placa ESP32 y cargar el programa.

`SERVER_URL` debe usar la IP del computador que ejecuta el servidor, no
`localhost`.

## Uso del panel

Despues de iniciar sesion, la primera pantalla es **Inicio**, donde se muestran:

- Total de funcionarios, tarjetas activas, movimientos del dia y accesos denegados.
- Grafico de ingresos y salidas por dia.
- Grafico de movimientos por hora.
- Ultimos movimientos registrados.

Pestanas disponibles:

- **Usuarios**: datos personales, cargo, grupo, contacto y fotografia.
- **Horarios**: franjas de trabajo individuales o por grupo.
- **Tarjetas**: asociar o eliminar tarjetas RFID de funcionarios.

## Uso con el lector

1. Acerque una tarjeta al lector.
2. La lectura aparecera en el historial, inicialmente como denegada.
3. Copie el UID mostrado y registre el funcionario en Usuarios.
4. Asocie el UID al funcionario desde Tarjetas.
5. En la siguiente lectura, el servidor autorizara la tarjeta y el ESP32
   activara el rele.

La pantalla LCD 2004 I2C mostrara:

- Estado de WiFi e IP del ESP32.
- UID leido por el RC522.
- Nombre retornado por la plataforma.
- Resultado de acceso.
- Movimiento del usuario: **ENTRA** cuando la API responde `ingreso` y
  **SALE** cuando responde `salida`.

## API

- `POST /api/access`: valida un UID y registra el evento.
- `GET /api/dashboard`: metricas y graficos.
- `GET /api/personnel`: lista funcionarios.
- `POST /api/personnel`: registra funcionario.
- `PUT /api/personnel/:id`: actualiza funcionario.
- `DELETE /api/personnel/:id`: elimina funcionario.
- `GET /api/cards`: lista tarjetas.
- `POST /api/cards`: asocia tarjeta.
- `DELETE /api/cards/:id`: elimina tarjeta.
- `GET /api/schedules`: lista horarios.
- `POST /api/schedules`: registra horario.
- `DELETE /api/schedules/:id`: elimina horario.
- `GET /api/events`: lista los ultimos eventos.
