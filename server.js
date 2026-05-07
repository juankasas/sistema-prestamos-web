// === Compatibilidad con Node 22 ===
process.env.NODE_OPTIONS = "--openssl-legacy-provider";

// === DEPENDENCIAS ===
const fs = require("fs");
const path = require("path");
const express = require("express");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");
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

// =============================
// CREDENCIALES
// =============================
let auth;

try {
  const credentialsPath = process.env.RENDER
    ? "/etc/secrets/credentials.json"
    : path.join(__dirname, "credentials.json");

  const raw = fs.readFileSync(credentialsPath, "utf8");
  const json = JSON.parse(raw);

  const cleanedKey = (json.private_key || "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

  auth = new GoogleAuth({
    credentials: {
      client_email: json.client_email,
      private_key: cleanedKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  console.log("✅ Credenciales cargadas correctamente.");
} catch (e) {
  console.error("❌ Error leyendo credenciales:", e.message);
}

const spreadsheetId =
  process.env.SHEET_ID || "1_RXiymPeK5sSPDofjfC-LlugeBNoasMztvLUtJ959Yc";

// =============================
// HELPERS
// =============================
async function sheetsApi() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function parseNumero(valor) {
  if (valor === undefined || valor === null || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let txt = String(valor)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!txt) return 0;

  const tieneComa = txt.includes(",");
  const tienePunto = txt.includes(".");

  if (tieneComa && tienePunto) {
    const ultimaComa = txt.lastIndexOf(",");
    const ultimoPunto = txt.lastIndexOf(".");

    if (ultimaComa > ultimoPunto) {
      txt = txt.replace(/\./g, "").replace(",", ".");
    } else {
      txt = txt.replace(/,/g, "");
    }
  } else if (tieneComa) {
    txt = txt.replace(",", ".");
  }

  return parseFloat(txt) || 0;
}

function moneyNumber(n) {
  return Number(parseNumero(n).toFixed(2));
}

function fechaColombia() {
  return new Date().toLocaleDateString("es-CO");
}

function parseFecha(valor) {
  if (!valor) return null;

  const txt = String(valor).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    const [y, m, d] = txt.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(txt)) {
    const [d, m, y] = txt.split("/").map(Number);
    return new Date(y, m - 1, d);
  }

  const f = new Date(txt);
  return isNaN(f.getTime()) ? null : f;
}

function esMismoMes(fecha, mes, anio) {
  const f = parseFecha(fecha);
  if (!f) return false;
  return f.getMonth() + 1 === mes && f.getFullYear() === anio;
}

function esDiaDeCierre(fecha = new Date()) {
  const dia = fecha.getDate();
  const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  return dia === 30 || dia === ultimoDia;
}

async function leerClientes() {
  const sheets = await sheetsApi();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Clientes!A:L",
  });
  return r.data.values || [];
}

async function leerPagos() {
  const sheets = await sheetsApi();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Pagos!A:F",
  });
  return r.data.values || [];
}

async function leerGastos() {
  const sheets = await sheetsApi();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Gastos!A:D",
  });
  return r.data.values || [];
}

async function leerCierreMes() {
  const sheets = await sheetsApi();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "CierreMes!A:I",
  });
  return r.data.values || [];
}

function buscarClienteActivo(clientes, clienteIngresado) {
  const key = norm(clienteIngresado);

  return clientes
    .slice(1)
    .reverse()
    .find((r) => {
      if (!r || !r[0]) return false;

      const codigo = norm(r[0]);
      const nombre = norm(r[1]);
      const estado = norm(r[10]);
      const saldo = parseNumero(r[9]);

      return (
        (codigo === key || nombre === key) &&
        estado !== "pagado" &&
        estado !== "eliminado" &&
        saldo > 0
      );
    });
}

function siguienteCodigo(clientes) {
  let max = 0;

  clientes.slice(1).forEach((r) => {
    const codigo = String(r[0] || "");
    const match = codigo.match(/CL-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  });

  return `CL-${String(max + 1).padStart(3, "0")}`;
}

// =============================
// LOGIN
// =============================
app.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === "2983") return res.redirect("/dueno.html");
  if (password === "4321") return res.redirect("/cobrador.html");

  res.status(401).send("❌ Clave incorrecta");
});

// =============================
// CLIENTES
// =============================
app.get("/api/datos", async (_, res) => {
  try {
    const datos = await leerClientes();
    res.json({ datos });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al obtener clientes.");
  }
});

app.post("/api/clientes/agregar", async (req, res) => {
  try {
    const { nombre, telefono, monto, semanas, fecha, interesPorcentaje } = req.body;

    if (!nombre || !telefono || !monto || !semanas) {
      return res.status(400).send("⚠️ Datos incompletos.");
    }

    const m = parseNumero(monto);
    const s = parseNumero(semanas);
    const p = parseNumero(interesPorcentaje);

    const ciclos = s / 24;
    const i = moneyNumber(m * (p / 100));
    const t = moneyNumber(m + i);
    const v = s > 0 ? moneyNumber(t / s) : 0;

    const sheets = await sheetsApi();
    const clientes = await leerClientes();
    const codigo = siguienteCodigo(clientes);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Clientes!A:L",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
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
          fecha || fechaColombia(),
        ]],
      },
    });

    await actualizarConsolidadoEnHoja();

    res.send(`✅ Cliente ${nombre} registrado correctamente con código ${codigo}.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al registrar cliente.");
  }
});

app.put("/api/clientes/editar", async (req, res) => {
  try {
    const { codigo, nombre, telefono, monto, cuotas, interesPorcentaje } = req.body;

    if (!codigo || !nombre || !telefono || !monto || !cuotas) {
      return res.status(400).send("⚠️ Datos incompletos.");
    }

    const clientes = await leerClientes();
    const idx = clientes.findIndex((r, i) => i > 0 && norm(r[0]) === norm(codigo));

    if (idx < 1) return res.status(404).send("❌ Cliente no encontrado.");

    const m = parseNumero(monto);
    const s = parseNumero(cuotas);
    const p = parseNumero(interesPorcentaje);

    const ciclos = s / 24;
    const i = moneyNumber(m * (p / 100));
    const t = moneyNumber(m + i);
    const v = s > 0 ? moneyNumber(t / s) : 0;

    const pagado = parseNumero(clientes[idx][8]);
    const saldo = moneyNumber(Math.max(0, t - pagado));
    const estado = saldo <= 0 ? "Pagado" : "Pagando";

    const fila = idx + 1;
    const sheets = await sheetsApi();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!B${fila}:K${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nombre, telefono, m, i, t, s, v, pagado, saldo, estado]],
      },
    });

    await actualizarConsolidadoEnHoja();

    res.send("✏️ Cliente actualizado correctamente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al editar cliente.");
  }
});

app.delete("/api/clientes/eliminar/:codigo", async (req, res) => {
  try {
    const codigo = req.params.codigo;
    const clientes = await leerClientes();
    const idx = clientes.findIndex((r, i) => i > 0 && norm(r[0]) === norm(codigo));

    if (idx < 1) return res.status(404).send("❌ Cliente no encontrado.");

    const fila = idx + 1;
    const sheets = await sheetsApi();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!K${fila}:K${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["Eliminado"]],
      },
    });

    await actualizarConsolidadoEnHoja();

    res.send(`🗑️ Cliente ${codigo} ocultado correctamente.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error eliminando cliente.");
  }
});

// =============================
// PAGOS
// =============================
async function recomputarClienteDesdePagos(codigoCliente) {
  const clientes = await leerClientes();
  const pagos = await leerPagos();

  const idx = clientes.findIndex(
    (r, i) => i > 0 && norm(r[0]) === norm(codigoCliente)
  );

  if (idx < 1) return;

  const row = clientes[idx];
  const code = row[0];

  const total = parseNumero(row[5]);
  const cuotasBase = parseNumero(row[6]);
  const valorCuota = parseNumero(row[7]);

  let pagado = 0;

  for (let j = 1; j < pagos.length; j++) {
    const p = pagos[j];
    if (!p || !p[0]) continue;

    if (norm(p[0]) === norm(code)) {
      pagado += parseNumero(p[3]);
    }
  }

  pagado = moneyNumber(pagado);
  const saldo = moneyNumber(Math.max(0, total - pagado));
  const cuotasPendientes = saldo <= 0
    ? 0
    : valorCuota > 0
      ? Math.ceil(saldo / valorCuota)
      : cuotasBase;

  const estado = saldo <= 0 ? "Pagado" : "Pagando";

  const sheets = await sheetsApi();
  const fila = idx + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Clientes!G${fila}:K${fila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[cuotasPendientes, valorCuota, pagado, saldo, estado]],
    },
  });
}

app.get("/api/pagos", async (_, res) => {
  try {
    const pagos = await leerPagos();
    const clientes = await leerClientes();
    const lista = [];

    for (let i = 1; i < pagos.length; i++) {
      const p = pagos[i];
      if (!p || !p[0]) continue;

      const c = clientes.find((r, idx) => idx > 0 && norm(r[0]) === norm(p[0]));
      if (!c) continue;

      const estado = norm(c[10]);
      const saldo = parseNumero(c[9]);

      if (estado === "pagado" || estado === "eliminado" || saldo <= 0) continue;

      lista.push({
        rowNumber: i + 1,
        cliente: p[0],
        nombre: p[1] || c[1],
        cuota: p[2],
        valor: parseNumero(p[3]),
        observacion: p[4] || "-",
        fecha: p[5] || "",
      });
    }

    res.json({ pagos: lista });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error cargando pagos.");
  }
});

app.post("/api/pagos/agregar", async (req, res) => {
  try {
    const { cliente, cuota, valor, observacion, fecha } = req.body;

    if (!cliente || !cuota || !valor) {
      return res.status(400).send("⚠️ Faltan datos.");
    }

    const clientes = await leerClientes();
    const match = buscarClienteActivo(clientes, cliente);

    if (!match) return res.status(404).send("❌ Cliente activo no encontrado.");

    const code = match[0];
    const nombreCliente = match[1] || "";

    const sheets = await sheetsApi();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Pagos!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          String(code),
          String(nombreCliente),
          parseNumero(cuota),
          moneyNumber(valor),
          observacion || "-",
          fecha || fechaColombia(),
        ]],
      },
    });

    await recomputarClienteDesdePagos(code);
    await actualizarConsolidadoEnHoja();

    res.send(`✅ Pago registrado correctamente para ${code} - ${nombreCliente}.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al registrar pago.");
  }
});

app.put("/api/pagos/editar", async (req, res) => {
  try {
    const { rowNumber, cliente, cuota, valor, observacion, fecha } = req.body;

    if (!rowNumber || !cliente || !cuota || !valor) {
      return res.status(400).send("⚠️ Datos incompletos.");
    }

    const clientes = await leerClientes();
    const match = buscarClienteActivo(clientes, cliente);

    if (!match) return res.status(404).send("❌ Cliente activo no encontrado.");

    const code = match[0];
    const nombreCliente = match[1] || "";

    const sheets = await sheetsApi();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Pagos!A${rowNumber}:F${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          String(code),
          String(nombreCliente),
          parseNumero(cuota),
          moneyNumber(valor),
          observacion || "-",
          fecha || fechaColombia(),
        ]],
      },
    });

    await recomputarClienteDesdePagos(code);
    await actualizarConsolidadoEnHoja();

    res.send("✏️ Pago actualizado correctamente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error al editar pago.");
  }
});

// =============================
// GASTOS
// =============================
app.get("/api/gastos", async (_, res) => {
  try {
    const g = await leerGastos();

    res.json({
      gastos: g.slice(1).map((x, i) => ({
        fila: i + 2,
        fecha: x[0] || "",
        concepto: x[1] || "",
        valor: parseNumero(x[2]),
        observacion: x[3] || "",
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error cargando gastos.");
  }
});

app.post("/api/gastos/agregar", async (req, res) => {
  try {
    const { fecha, concepto, valor, observacion } = req.body;

    if (!concepto || !valor) {
      return res.status(400).send("⚠️ Concepto y valor son obligatorios.");
    }

    const sheets = await sheetsApi();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Gastos!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          fecha || fechaColombia(),
          concepto,
          moneyNumber(valor),
          observacion || "-",
        ]],
      },
    });

    await actualizarConsolidadoEnHoja();

    res.send("💸 Gasto guardado correctamente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error guardando gasto.");
  }
});

// =============================
// CONSOLIDADO
// =============================
async function calcularConsolidadoGeneral() {
  const clientes = await leerClientes();
  const pagos = await leerPagos();
  const gastos = await leerGastos();

  let capital = 0;
  let interes = 0;
  let rec = 0;
  let gast = 0;

  clientes.slice(1).forEach((c) => {
    capital += parseNumero(c[3]);
    interes += parseNumero(c[4]);
  });

  pagos.slice(1).forEach((p) => {
    rec += parseNumero(p[3]);
  });

  gastos.slice(1).forEach((g) => {
    gast += parseNumero(g[2]);
  });

  capital = moneyNumber(capital);
  interes = moneyNumber(interes);
  rec = moneyNumber(rec);
  gast = moneyNumber(gast);

  const utilidadReal = moneyNumber(interes - gast);
  const capitalDisponibleReal = moneyNumber(capital);

  return {
    capital,
    interes,
    totalRecaudado: rec,
    recSem: rec,
    recMes: rec,
    recAnual: rec,
    gastos: gast,
    utilidadReal,
    capitalDisponibleReal,
  };
}

async function actualizarConsolidadoEnHoja() {
  const d = await calcularConsolidadoGeneral();
  const sheets = await sheetsApi();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Consolidado!A2:I2",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        d.capital,
        d.interes,
        d.totalRecaudado,
        d.recSem,
        d.recMes,
        d.recAnual,
        d.gastos,
        d.utilidadReal,
        d.capitalDisponibleReal,
      ]],
    },
  });

  return d;
}

app.get("/api/consolidado", async (_, res) => {
  try {
    await cierreMesAutomaticoSiCorresponde();
    const d = await actualizarConsolidadoEnHoja();
    res.json(d);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error consolidado.");
  }
});

// =============================
// CIERRE DE MES
// =============================
function calcularCierreMesDatos(clientes, pagos, gastos, mes, anio) {
  let capitalMes = 0;
  let interesesMes = 0;
  let recaudadoMes = 0;
  let gastosMes = 0;

  clientes.slice(1).forEach((c) => {
    if (esMismoMes(c[11], mes, anio)) {
      capitalMes += parseNumero(c[3]);
      interesesMes += parseNumero(c[4]);
    }
  });

  pagos.slice(1).forEach((p) => {
    if (esMismoMes(p[5], mes, anio)) {
      recaudadoMes += parseNumero(p[3]);
    }
  });

  gastos.slice(1).forEach((g) => {
    if (esMismoMes(g[0], mes, anio)) {
      gastosMes += parseNumero(g[2]);
    }
  });

  capitalMes = moneyNumber(capitalMes);
  interesesMes = moneyNumber(interesesMes);
  recaudadoMes = moneyNumber(recaudadoMes);
  gastosMes = moneyNumber(gastosMes);

  const utilidadRealMes = moneyNumber(interesesMes - gastosMes);
  const capitalDisponibleMes = moneyNumber(capitalMes);

  return {
    mes,
    anio,
    capitalMes,
    interesesMes,
    recaudadoMes,
    gastosMes,
    utilidadRealMes,
    capitalDisponibleMes,
    fechaCierre: fechaColombia(),
  };
}

async function existeCierreMes(mes, anio) {
  const cierres = await leerCierreMes();

  return cierres.slice(1).some((r) => {
    return parseInt(r[0], 10) === mes && parseInt(r[1], 10) === anio;
  });
}

async function guardarCierreMes(mes, anio) {
  const clientes = await leerClientes();
  const pagos = await leerPagos();
  const gastos = await leerGastos();

  const d = calcularCierreMesDatos(clientes, pagos, gastos, mes, anio);

  const sheets = await sheetsApi();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "CierreMes!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        d.mes,
        d.anio,
        d.capitalMes,
        d.interesesMes,
        d.recaudadoMes,
        d.gastosMes,
        d.utilidadRealMes,
        d.capitalDisponibleMes,
        d.fechaCierre,
      ]],
    },
  });

  return d;
}

async function cierreMesAutomaticoSiCorresponde() {
  const hoy = new Date();

  if (!esDiaDeCierre(hoy)) {
    return null;
  }

  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();

  const yaExiste = await existeCierreMes(mes, anio);

  if (yaExiste) {
    return null;
  }

  return await guardarCierreMes(mes, anio);
}

app.get("/api/cierre-mes", async (req, res) => {
  try {
    const hoy = new Date();
    const mes = parseInt(req.query.mes || hoy.getMonth() + 1, 10);
    const anio = parseInt(req.query.anio || hoy.getFullYear(), 10);

    const clientes = await leerClientes();
    const pagos = await leerPagos();
    const gastos = await leerGastos();

    const datos = calcularCierreMesDatos(clientes, pagos, gastos, mes, anio);
    res.json(datos);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error calculando cierre de mes.");
  }
});

app.post("/api/cierre-mes/generar", async (req, res) => {
  try {
    const hoy = new Date();
    const mes = parseInt((req.body && req.body.mes) || hoy.getMonth() + 1, 10);
    const anio = parseInt((req.body && req.body.anio) || hoy.getFullYear(), 10);

    const yaExiste = await existeCierreMes(mes, anio);

    if (yaExiste) {
      return res.send(`⚠️ El cierre de ${mes}/${anio} ya existe. No se duplicó.`);
    }

    await guardarCierreMes(mes, anio);

    res.send(`✅ Cierre de mes ${mes}/${anio} guardado correctamente.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error guardando cierre de mes.");
  }
});

// =============================
// PDF
// =============================
app.get("/api/pdf/clientes", async (_req, res) => {
  try {
    const clientes = await leerClientes();
    const pagos = await leerPagos();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=reporte-prestamos.pdf");

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    const fontPath = path.join(__dirname, "fonts", "DejaVuSans.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("DejaVu", fontPath);
      doc.font("DejaVu");
    }

    doc.fontSize(18).text("Reporte de Préstamos - Finanzas JKzas", { align: "center" });
    doc.moveDown();

    clientes.slice(1).forEach((c) => {
      if (!c || !c[0]) return;

      doc.fontSize(12).text(`${c[1]} (${c[0]}) - Tel: ${c[2]}`);
      doc.fontSize(10).text(
        `Monto: $${parseNumero(c[3])} | Interés: $${parseNumero(c[4])} | Total: $${parseNumero(c[5])}`
      );
      doc.text(
        `Cuotas/Días: ${c[6]} | Valor cuota: $${parseNumero(c[7])} | Pagado: $${parseNumero(c[8])} | Saldo: $${parseNumero(c[9])} | Estado: ${c[10]}`
      );

      const pagosCliente = pagos.slice(1).filter((p) => norm(p[0]) === norm(c[0]));

      if (pagosCliente.length) {
        pagosCliente.forEach((p) => {
          doc.text(
            `Pago ${p[2]}: $${parseNumero(p[3])} - ${p[5] || ""} ${p[4] || ""}`
          );
        });
      } else {
        doc.text("Sin pagos registrados.");
      }

      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error generando PDF.");
  }
});

// =============================
// START
// =============================
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log("Dueño ➜ http://localhost:3000/dueno.html");
  console.log("Cobrador ➜ http://localhost:3000/cobrador.html");
});