// === CREAR AUTOMÁTICAMENTE EL ARCHIVO credentials.json EN RENDER ===
const fs = require("fs");
const path = require("path");

if (process.env.GOOGLE_CREDENTIALS) {
  const credentialsPath = path.join(__dirname, "credentials.json"); // ✅ raíz

  // Crear/reescribir el archivo en la raíz del proyecto
  fs.writeFileSync(credentialsPath, process.env.GOOGLE_CREDENTIALS);
  console.log("✅ Archivo credentials.json creado correctamente en Render (raíz).");

  // 🔍 Verificar que el archivo exista y sea legible
  if (fs.existsSync(credentialsPath)) {
    console.log("✅ El archivo credentials.json existe y se puede leer en Render.");
  } else {
    console.error("❌ No se encontró credentials.json en Render.");
  }

} else {
  console.warn("⚠️ Variable GOOGLE_CREDENTIALS no encontrada.");
}

// =============================
//  SISTEMA PRÉSTAMOS – Server
//  • PDF por rango/cliente
//  • Recomputar sin borrar filas
//  • “Eliminar” SOLO marca en hoja (no borra)
//  • Editar cliente
//  • Consolidado: responde a la UI y opcionalmente escribe en la hoja
// =============================
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const session = require("express-session");
const PDFDocument = require("pdfkit");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use(
  session({
    secret: "clave_segura_123",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// === GOOGLE AUTH ===
const { google } = require("googleapis");
const { JWT } = require("google-auth-library");

// Leer credenciales desde las variables de entorno
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  console.log("✅ Credenciales cargadas correctamente.");
} catch (e) {
  console.error("❌ No se pudieron leer las credenciales:", e.message);
}

// Crear cliente de autenticación JWT
const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// === PRUEBA DIRECTA DE CONEXIÓN ===
(async () => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SHEET_ID,
    });
    console.log("✅ Conexión exitosa con Google Sheets:", response.data.properties.title);
  } catch (error) {
    console.error("❌ Error de conexión con Google Sheets:", error.message);
  }
})();

// === ID DE LA HOJA ===
const spreadsheetId = "1_RXiymPeK5sSPDofjfC-LlugeBNoasMztvLUtJ959Yc";

// === HELPERS ===
async function sheetsApi() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}
async function getSheetIdByName(nombreHoja) {
  const sheets = await sheetsApi();
  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const hoja = info.data.sheets.find((s) => s.properties.title === nombreHoja);
  return hoja ? hoja.properties.sheetId : 0;
}
async function leerClientes() {
  const sheets = await sheetsApi();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Clientes!A:L",
  });
  return resp.data.values || [];
}
async function leerPagos() {
  const sheets = await sheetsApi();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Pagos!A:E",
  });
  return resp.data.values || [];
}
const norm = (v) => String(v || "").trim().toLowerCase();

// === LOGIN ===
app.post("/login", (req, res) => {
  const { password } = req.body || {};
  if (password === "2983") return res.redirect("/dueno.html");
  if (password === "4321") return res.redirect("/cobrador.html");
  return res.status(401).send("❌ Clave incorrecta.");
});

// === LISTAR CLIENTES ===
app.get("/api/datos", async (_req, res) => {
  try {
    const datos = await leerClientes();
    res.json({ datos });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al obtener clientes.");
  }
});

// === CONSOLIDADO ===
app.get("/api/consolidado", async (_req, res) => {
  try {
    const clientes = await leerClientes();
    const pagos = await leerPagos();
    const rows = clientes.filter((r, i) => i > 0 && r[0]);
    const pagosRows = pagos.filter((r, i) => i > 0 && r[0]);

    let capital = 0,
      interes = 0,
      total = 0,
      rec = 0;
    for (const r of rows) {
      capital += Number(r[3] || 0);
      interes += Number(r[4] || 0);
      total += Number(r[5] || 0);
    }
    for (const p of pagosRows) rec += Number(p[2] || 0);

    try {
      const sheets = await sheetsApi();
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Consolidado!A2:F2",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[capital, interes, rec, rec, rec, rec]],
        },
      });
    } catch (e) {}

    res.json({
      capital,
      interes,
      totalRecaudado: rec,
      recSem: rec,
      recMes: rec,
      recAnual: rec,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error consolidado.");
  }
});

// === AGREGAR CLIENTE ===
app.post("/api/clientes/agregar", async (req, res) => {
  try {
    const { nombre, telefono, monto, semanas, fecha } = req.body;
    if (!nombre || !telefono || !monto || !semanas)
      return res.status(400).send("⚠️ Datos incompletos.");

    const m = parseFloat(monto);
    const s = parseInt(semanas, 10);
    const i = m * 0.2;
    const t = m + i;
    const v = s > 0 ? t / s : 0;
    const fechaFinal = fecha?.trim()
      ? fecha
      : new Date().toLocaleDateString("es-CO");

    const sheets = await sheetsApi();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Clientes!A2:A",
    });
    const nextId = (resp.data.values ? resp.data.values.length : 0) + 1;
    const codigo = `CL-${String(nextId).padStart(3, "0")}`;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Clientes!A:L",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            codigo,
            nombre,
            telefono,
            m,
            i,
            t,
            s,
            v,
            0,
            t,
            "Pagando",
            fechaFinal,
          ],
        ],
      },
    });

    res.send(`✅ Cliente ${nombre} registrado correctamente.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al registrar cliente.");
  }
});
// === resto del código idéntico...
// (no se modificó nada más)

// === EDITAR CLIENTE ===
app.put("/api/clientes/editar", async (req, res) => {
  try {
    const { codigo, nombre, telefono, monto, cuotas } = req.body;
    if (!codigo || !nombre || !telefono || !monto || !cuotas)
      return res.status(400).send("⚠️ Datos incompletos.");

    const m = parseFloat(monto);
    const s = parseInt(cuotas, 10);
    const i = m * 0.2;
    const t = m + i;
    const v = s > 0 ? t / s : 0;

    const rows = await leerClientes();
    const idx = rows.findIndex((r) => (r[0] || "").trim() === codigo.trim());
    if (idx < 1) return res.status(404).send("❌ Cliente no encontrado.");
    const rowNumber = idx + 1;
    const pagado = Number(rows[idx][8] || 0);
    const saldo = Math.max(0, t - pagado);
    const estado = saldo <= 0 ? "Pagado" : rows[idx][10] || "Pagando";

    const sheets = await sheetsApi();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!B${rowNumber}:H${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[nombre, telefono, m, i, t, s, v]] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!J${rowNumber}:K${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[saldo, estado]] },
    });

    res.send("✏️ Cliente actualizado correctamente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al editar cliente.");
  }
});

// === UTILIDADES ===
async function recomputarClienteDesdePagos(codigoONombre) {
  const clientes = await leerClientes();
  const pagos = await leerPagos();

  // localizar por código o nombre
  const found = (() => {
    const key = norm(codigoONombre);
    for (let i = 1; i < clientes.length; i++) {
      const r = clientes[i];
      if (!r || !r[0]) continue;
      if (norm(r[0]) === key || norm(r[1]) === key) return { idx: i, row: r };
    }
    return null;
  })();
  if (!found) return;

  const { idx, row } = found;
  const code = row[0];
  const total = Number(row[5] || 0);
  const cuotasBase = Number(row[6] || 0);
  const valorCuota = Number(row[7] || 0);

  let pagado = 0;
  for (let j = 1; j < pagos.length; j++) {
    const p = pagos[j];
    if (!p || !p[0]) continue;
    if (norm(p[0]) === norm(code) || norm(p[0]) === norm(row[1])) {
      pagado += Number(p[2] || 0);
    }
  }

  const saldo = Math.max(0, total - pagado);
  let cuotasPendientes = cuotasBase;
  if (valorCuota > 0) cuotasPendientes = Math.ceil(saldo / valorCuota);
  const estado = saldo <= 0 ? "Pagado" : row[10] || "Pagando";

  const sheets = await sheetsApi();
  const fila = idx + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Clientes!I${fila}:K${fila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[pagado, saldo, estado]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Clientes!G${fila}:G${fila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[cuotasPendientes]] },
  });
}

// === PAGOS ===
app.get("/api/pagos", async (_req, res) => {
  try {
    const rows = await leerPagos();
    const items = [];
    const clientes = await leerClientes();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;

      // Buscar cliente asociado
      const clienteAsociado = clientes.find(
        (c, idx) =>
          idx > 0 &&
          (norm(c[0]) === norm(r[0]) || norm(c[1]) === norm(r[0])) &&
          Number(c[9] || 0) > 0 &&
          (c[10] || "").trim() !== "Pagado" &&
          (c[10] || "").trim() !== "Eliminado"
      );
      if (!clienteAsociado) continue; // ocultar clientes pagados en la interfaz

      items.push({
        rowNumber: i + 1,
        cliente: r[0],
        cuota: r[1],
        valor: r[2],
        observacion: r[3],
        fecha: r[4],
      });
    }
    res.json({ pagos: items });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error cargando pagos.");
  }
});

app.post("/api/pagos/agregar", async (req, res) => {
  try {
    const { cliente, cuota, valor, observacion, fecha } = req.body;
    if (!cliente || !cuota || !valor)
      return res.status(400).send("⚠️ Faltan datos.");

    const clientes = await leerClientes();
    const match = clientes.find(
      (r, i) =>
        i > 0 &&
        r[0] &&
        (norm(r[0]) === norm(cliente) || norm(r[1]) === norm(cliente))
    );
    if (!match) return res.status(404).send("❌ Cliente no encontrado.");
    const code = match[0];

    const sheets = await sheetsApi();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Pagos!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            code,
            cuota,
            valor,
            observacion || "-",
            fecha || new Date().toLocaleDateString("es-CO"),
          ],
        ],
      },
    });

    await recomputarClienteDesdePagos(code);
    res.send(`✅ Pago registrado correctamente para ${code}.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al registrar pago.");
  }
});

app.put("/api/pagos/editar", async (req, res) => {
  try {
    const { rowNumber, cliente, cuota, valor, observacion, fecha } = req.body;
    if (!rowNumber || !cliente || !cuota || !valor)
      return res.status(400).send("⚠️ Datos incompletos.");

    const clientes = await leerClientes();
    const match = clientes.find(
      (r, i) =>
        i > 0 &&
        r[0] &&
        (norm(r[0]) === norm(cliente) || norm(r[1]) === norm(cliente))
    );
    if (!match) return res.status(404).send("❌ Cliente no encontrado.");
    const code = match[0];

    const sheets = await sheetsApi();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Pagos!A${rowNumber}:E${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            code,
            cuota,
            valor,
            observacion || "-",
            fecha || new Date().toLocaleDateString("es-CO"),
          ],
        ],
      },
    });

    await recomputarClienteDesdePagos(code);
    res.send("✏️ Pago actualizado correctamente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al editar pago.");
  }
});

// === “ELIMINAR” CLIENTE (solo marca, NO borra hoja) ===
app.delete("/api/clientes/eliminar/:codigo", async (req, res) => {
  try {
    const codigo = req.params.codigo || "";
    const rows = await leerClientes();
    const idx = rows.findIndex((r) => (r[0] || "").trim() === codigo.trim());
    if (idx < 1) return res.status(404).send("❌ Cliente no encontrado.");
    const fila = idx + 1;

    const sheets = await sheetsApi();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!K${fila}:K${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Eliminado"]] },
    });

    res.send(
      `🗑️ Cliente ${codigo} ocultado en la interfaz (no se borró de la hoja).`
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al ocultar cliente.");
  }
});

// === PDF ===
function parseFechaCO(s) {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/").map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const mismoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
function mismaSemana(a, b) {
  const onejan = new Date(a.getFullYear(), 0, 1);
  const getWeek = (d) =>
    Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return a.getFullYear() === b.getFullYear() && getWeek(a) === getWeek(b);
}

app.get("/api/pdf/clientes", async (req, res) => {
  try {
    const tipo = (req.query.tipo || "todo").toLowerCase();
    const valor = (req.query.valor || "").trim().toLowerCase();

    const clientes = await leerClientes();
    const pagos = await leerPagos();
    const rows = clientes.filter((r, i) => i > 0 && r[0]); // incluir todos (activos, pagados, eliminados)
    const pagosRows = pagos.filter((r, i) => i > 0 && r[0]);
    const hoy = new Date();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=reporte-prestamos.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // ✅ Soporte para caracteres y emojis
    const fontPath = path.join(__dirname, "fonts", "DejaVuSans.ttf");
    doc.registerFont("DejaVu", fontPath);
    doc.font("DejaVu");

    doc.fontSize(18).text("📘 Reporte de Préstamos - Finanzas JKzas", { align: "center" });
    doc.moveDown();

    const list = rows.filter((c) => {
      const fc = parseFechaCO(c[11]);
      if (tipo === "cliente") {
        if (!valor) return true;
        return (
          (c[0] || "").toLowerCase().includes(valor) ||
          (c[1] || "").toLowerCase().includes(valor)
        );
      }
      if (tipo === "dia") return fc && mismoDia(fc, hoy);
      if (tipo === "semana") return fc && mismaSemana(fc, hoy);
      if (tipo === "mes")
        return fc && fc.getMonth() === hoy.getMonth() && fc.getFullYear() === hoy.getFullYear();
      if (tipo === "ano") return fc && fc.getFullYear() === hoy.getFullYear();
      return true;
    });

    for (const c of list) {
      const cod = c[0],
        nom = c[1];
      doc.fontSize(13).text(`👤 ${nom} (${cod}) - 📞 Tel: ${c[2]}`);
      doc
        .fontSize(11)
        .text(
          `💰 Monto: $${Number(c[3] || 0).toLocaleString("es-CO")} | 💵 Interés: $${Number(
            c[4] || 0
          ).toLocaleString("es-CO")} | 💸 Total: $${Number(c[5] || 0).toLocaleString("es-CO")}`
        );
      doc.text(`📊 Cuotas: ${c[6]} | 💳 Valor por cuota: $${Number(c[7] || 0).toLocaleString("es-CO")}`);
      doc.text(
        `✅ Pagado: $${Number(c[8] || 0).toLocaleString("es-CO")} | 💼 Saldo: $${Number(
          c[9] || 0
        ).toLocaleString("es-CO")} | 📋 Estado: ${c[10] || ""}`
      );
      doc.text(`📅 Fecha del préstamo: ${c[11] || "-"}`);
      doc.moveDown(0.3);

      const pagosCliente = pagosRows.filter((p) => p[0] === cod).filter((p) => {
        if (["cliente", "todo"].includes(tipo)) return true;
        const f = parseFechaCO(p[4]);
        if (!f) return false;
        if (tipo === "dia") return mismoDia(f, hoy);
        if (tipo === "semana") return mismaSemana(f, hoy);
        if (tipo === "mes")
          return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
        if (tipo === "ano") return f.getFullYear() === hoy.getFullYear();
        return true;
      });

      if (pagosCliente.length) {
        pagosCliente.forEach((p) => {
          doc.text(
            `💵 Pago ${p[1]}: $${Number(p[2] || 0).toLocaleString("es-CO")} — ${p[4] || "-"} ${
              p[3] && p[3] !== "-" ? `(${p[3]})` : ""
            }`
          );
        });
      } else {
        doc.text("⚠️ Sin pagos en el rango seleccionado.");
      }
      doc.moveDown(0.8);
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error generando PDF.");
  }
});

// === START ===
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
);
console.log("Dueño ➜  http://localhost:3000/dueno.html");
console.log("Cobrador ➜  http://localhost:3000/cobrador.html");
