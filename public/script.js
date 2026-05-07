// =============================
// 🚀 FINANZAS JKzas - SCRIPT DUEÑO
// ✅ Interés por ciclos de 24 días
// ✅ Corrige coma decimal
// ✅ Mantiene gastos, consolidado, PDF
// ✅ Restaura editar y eliminar cliente
// =============================

// === ELEMENTOS ===
const nombre = document.getElementById("nombre");
const telefono = document.getElementById("telefono");
const monto = document.getElementById("monto");
const cuotas = document.getElementById("cuotas");
const fecha = document.getElementById("fecha");
const porcentajeInteres = document.getElementById("porcentajeInteres");

const interesTxt = document.getElementById("interes");
const totalTxt = document.getElementById("total");
const valorCuotaTxt = document.getElementById("valorCuota");

const mensaje = document.getElementById("mensaje");
const tbodyClientes = document.querySelector("#tablaClientes tbody");

// === GASTOS ===
const fechaGasto = document.getElementById("fechaGasto");
const conceptoGasto = document.getElementById("conceptoGasto");
const valorGasto = document.getElementById("valorGasto");
const obsGasto = document.getElementById("obsGasto");
const mensajeGasto = document.getElementById("mensajeGasto");
const tbodyGastos = document.querySelector("#tablaGastos tbody");

// === CONSOLIDADO ===
const totalCapital = document.getElementById("totalCapital");
const totalInteres = document.getElementById("totalInteres");
const totalRecaudado = document.getElementById("totalRecaudado");
const totalSemanal = document.getElementById("totalSemanal");
const totalMensual = document.getElementById("totalMensual");
const totalAnual = document.getElementById("totalAnual");

const totalGastos = document.getElementById("totalGastos");
const utilidadReal = document.getElementById("utilidadReal");
const capitalDisponible = document.getElementById("capitalDisponible");

// =============================
// NORMALIZAR NÚMEROS
// =============================
function num(x) {
  if (x === undefined || x === null || x === "") return 0;

  let txt = String(x).trim().replace("$", "").replace(/\s/g, "");

  if (txt.includes(",") && txt.includes(".")) {
    const ultimaComa = txt.lastIndexOf(",");
    const ultimoPunto = txt.lastIndexOf(".");

    if (ultimaComa > ultimoPunto) {
      txt = txt.replace(/\./g, "").replace(",", ".");
    } else {
      txt = txt.replace(/,/g, "");
    }
  } else if (txt.includes(",")) {
    txt = txt.replace(",", ".");
  }

  return parseFloat(txt) || 0;
}

// =============================
// FORMATO MONEDA
// =============================
function money(n) {
  return "$" + num(n).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// =============================
// CÁLCULOS AUTOMÁTICOS
// =============================
function calcularValores() {
  const m = num(monto.value);
  const d = num(cuotas.value);
  const p = num(porcentajeInteres.value);

  const ciclos = d / 24;
  const interes = m * (p / 100);
  const total = m + interes;
  const valorCuota = d > 0 ? total / d : 0;

  interesTxt.textContent = money(interes);
  totalTxt.textContent = money(total);
  valorCuotaTxt.textContent = money(valorCuota);
}

[monto, cuotas, porcentajeInteres].forEach(el => {
  el.addEventListener("input", calcularValores);
});

// =============================
// REGISTRAR CLIENTE
// =============================
document.getElementById("btn-registrar").addEventListener("click", async () => {
  try {
    const resp = await fetch("/api/clientes/agregar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nombre: nombre.value.trim(),
        telefono: telefono.value.trim(),
        monto: num(monto.value),
        interesPorcentaje: num(porcentajeInteres.value),
        semanas: num(cuotas.value),
        fecha: fecha.value
      })
    });

    const text = await resp.text();

    if (!resp.ok) throw new Error(text);

    mensaje.style.color = "green";
    mensaje.textContent = text;

    nombre.value = "";
    telefono.value = "";
    monto.value = "";
    porcentajeInteres.value = "20";
    cuotas.value = "";
    fecha.value = "";

    calcularValores();
    await cargarClientes();
    await cargarConsolidado();

  } catch (err) {
    mensaje.style.color = "red";
    mensaje.textContent = "❌ " + err.message;
  }
});

// =============================
// CARGAR CLIENTES
// =============================
async function cargarClientes() {
  try {
    const resp = await fetch("/api/datos");
    const data = await resp.json();

    tbodyClientes.innerHTML = "";

    data.datos.slice(1).forEach(c => {
      if (!c[0]) return;

      const estado = String(c[10] || "").trim().toLowerCase();
      const saldo = num(c[9]);

      // Ocultar pagados/eliminados en la web, pero siguen en Drive
      if (estado === "pagado" || estado === "eliminado" || saldo <= 0) return;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${c[0]}</td>
        <td>${c[1]}</td>
        <td>${c[2]}</td>
        <td>${money(c[3])}</td>
        <td>${money(c[4])}</td>
        <td>${money(c[5])}</td>
        <td>${c[6]}</td>
        <td>${money(c[7])}</td>
        <td>${money(c[8])}</td>
        <td>${money(c[9])}</td>
        <td>${c[10]}</td>
        <td>${c[11]}</td>
        <td>
          <button class="editar" onclick="editarCliente('${c[0]}')">✏️</button>
          <button class="eliminar" onclick="eliminarCliente('${c[0]}')">🗑</button>
        </td>
      `;

      tbodyClientes.appendChild(tr);
    });

    if (!tbodyClientes.children.length) {
      tbodyClientes.innerHTML =
        "<tr><td colspan='13'>No hay clientes activos para mostrar.</td></tr>";
    }

  } catch (err) {
    tbodyClientes.innerHTML =
      "<tr><td colspan='13'>❌ Error cargando clientes.</td></tr>";
  }
}

// =============================
// EDITAR CLIENTE
// =============================
async function editarCliente(codigo) {
  try {
    const resp = await fetch("/api/datos");
    const data = await resp.json();

    const clienteActual = data.datos.find(c => c[0] === codigo);

    if (!clienteActual) {
      alert("❌ Cliente no encontrado.");
      return;
    }

    const nombreNuevo = prompt("Nuevo nombre:", clienteActual[1] || "");
    if (nombreNuevo === null) return;

    const telefonoNuevo = prompt("Nuevo teléfono:", clienteActual[2] || "");
    if (telefonoNuevo === null) return;

    const montoNuevo = prompt("Nuevo monto:", clienteActual[3] || "");
    if (montoNuevo === null) return;

    const cuotasNueva = prompt("Nuevas cuotas / días:", clienteActual[6] || "");
    if (cuotasNueva === null) return;

    const interesActual = clienteActual[3] > 0
      ? ((num(clienteActual[4]) / num(clienteActual[3])) * 100 * (24 / num(clienteActual[6])))
      : 20;

    const interesNuevo = prompt("Nuevo porcentaje de interés:", interesActual.toFixed(2));
    if (interesNuevo === null) return;

    const editarResp = await fetch("/api/clientes/editar", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        codigo,
        nombre: nombreNuevo.trim(),
        telefono: telefonoNuevo.trim(),
        monto: num(montoNuevo),
        cuotas: num(cuotasNueva),
        interesPorcentaje: num(interesNuevo)
      })
    });

    const text = await editarResp.text();

    if (!editarResp.ok) throw new Error(text);

    alert(text);

    await cargarClientes();
    await cargarConsolidado();

  } catch (err) {
    alert("❌ " + err.message);
  }
}

// =============================
// ELIMINAR CLIENTE
// =============================
async function eliminarCliente(codigo) {
  if (!confirm(`¿Ocultar cliente ${codigo} de la web?`)) return;

  try {
    const resp = await fetch("/api/clientes/eliminar/" + codigo, {
      method: "DELETE"
    });

    const text = await resp.text();

    if (!resp.ok) throw new Error(text);

    alert(text);

    await cargarClientes();
    await cargarConsolidado();

  } catch (err) {
    alert("❌ " + err.message);
  }
}

// =============================
// REGISTRAR GASTO
// =============================
document.getElementById("btn-guardar-gasto").addEventListener("click", async () => {
  try {
    const resp = await fetch("/api/gastos/agregar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fecha: fechaGasto.value,
        concepto: conceptoGasto.value.trim(),
        valor: num(valorGasto.value),
        observacion: obsGasto.value.trim()
      })
    });

    const text = await resp.text();

    if (!resp.ok) throw new Error(text);

    mensajeGasto.style.color = "green";
    mensajeGasto.textContent = text;

    fechaGasto.value = "";
    conceptoGasto.value = "";
    valorGasto.value = "";
    obsGasto.value = "";

    await cargarGastos();
    await cargarConsolidado();

  } catch (err) {
    mensajeGasto.style.color = "red";
    mensajeGasto.textContent = "❌ " + err.message;
  }
});

// =============================
// CARGAR GASTOS
// =============================
async function cargarGastos() {
  try {
    const resp = await fetch("/api/gastos");
    const data = await resp.json();

    tbodyGastos.innerHTML = "";

    data.gastos.forEach(g => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${g.fila || ""}</td>
        <td>${g.fecha || ""}</td>
        <td>${g.concepto || ""}</td>
        <td>${money(g.valor)}</td>
        <td>${g.observacion || ""}</td>
      `;

      tbodyGastos.appendChild(tr);
    });

    if (!tbodyGastos.children.length) {
      tbodyGastos.innerHTML =
        "<tr><td colspan='5'>No hay gastos registrados.</td></tr>";
    }

  } catch (err) {
    tbodyGastos.innerHTML =
      "<tr><td colspan='5'>❌ Error cargando gastos.</td></tr>";
  }
}

// =============================
// CONSOLIDADO
// =============================
async function cargarConsolidado() {
  try {
    const resp = await fetch("/api/consolidado");
    const d = await resp.json();

    totalCapital.textContent = money(d.capital);
    totalInteres.textContent = money(d.interes);
    totalRecaudado.textContent = money(d.totalRecaudado);
    totalSemanal.textContent = money(d.recSem);
    totalMensual.textContent = money(d.recMes);
    totalAnual.textContent = money(d.recAnual);

    totalGastos.textContent = money(d.gastos);
    utilidadReal.textContent = money(d.utilidadReal);
    capitalDisponible.textContent = money(num(d.capital) - num(d.gastos));

  } catch (err) {
    console.error("Error cargando consolidado:", err);
  }
}

// =============================
// PDF
// =============================
document.getElementById("btnPDF").addEventListener("click", () => {
  const tipo = document.getElementById("filtroPDF").value;
  window.open(`/api/pdf/clientes?tipo=${tipo}`, "_blank");
});

// =============================
// INICIO
// =============================
calcularValores();
cargarClientes();
cargarGastos();
cargarConsolidado();