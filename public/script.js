// =============================
//  SCRIPT DUEÑO - FINANZAS JKzas
//  • Editar funcional
//  • Primera fila visible
//  • Ocultar en UI los "Eliminado" o saldo 0 (sin borrar de la hoja)
//  • PDF por cliente / día / semana / mes / año / todo
//  • Scroll horizontal estable (lo maneja dueno.html)
// =============================

// --- Selección de elementos ---
const nombre = document.getElementById("nombre");
const telefono = document.getElementById("telefono");
const monto = document.getElementById("monto");
const cuotas = document.getElementById("cuotas");
const fecha = document.getElementById("fecha");
const interes = document.getElementById("interes");
const total = document.getElementById("total");
const valorCuota = document.getElementById("valorCuota");
const mensaje = document.getElementById("mensaje");
const tabla = document.getElementById("tablaClientes").querySelector("tbody");

// --- Consolidado ---
const totalCapital = document.getElementById("totalCapital");
const totalInteres = document.getElementById("totalInteres");
const totalRecaudado = document.getElementById("totalRecaudado");
const totalSemanal = document.getElementById("totalSemanal");
const totalMensual = document.getElementById("totalMensual");
const totalAnual = document.getElementById("totalAnual");

const formato = (v) => `$${Number(v || 0).toLocaleString("es-CO")}`;

// --- Calcular valores de interés ---
[monto, cuotas].forEach((el) =>
  el.addEventListener("input", () => {
    const m = parseFloat(monto.value) || 0;
    const c = parseInt(cuotas.value) || 0;
    const i = m * 0.2;
    const t = m + i;
    const v = c > 0 ? t / c : 0;
    interes.textContent = formato(i);
    total.textContent = formato(t);
    valorCuota.textContent = formato(v);
  })
);

// --- Registrar cliente ---
document.getElementById("btn-registrar").addEventListener("click", async () => {
  const data = {
    nombre: nombre.value.trim(),
    telefono: telefono.value.trim(),
    monto: monto.value.trim(),
    semanas: cuotas.value.trim(),
    fecha: fecha.value,
  };
  if (!data.nombre || !data.telefono || !data.monto || !data.semanas) {
    mensaje.style.color = "red";
    mensaje.textContent = "⚠️ Completa todos los campos.";
    return;
  }
  try {
    const resp = await fetch("/api/clientes/agregar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(text);
    mensaje.style.color = "green";
    mensaje.textContent = text;
    await cargarClientes();
    await actualizarConsolidado();
    nombre.value = telefono.value = monto.value = cuotas.value = fecha.value = "";
  } catch (err) {
    mensaje.style.color = "red";
    mensaje.textContent = "❌ " + err.message;
  }
});

// --- Cargar clientes (solo UI activa: oculta Pagados/Eliminados/Saldo=0) ---
async function cargarClientes() {
  tabla.innerHTML = "<tr><td colspan='13'>Cargando clientes...</td></tr>";
  try {
    const resp = await fetch("/api/datos");
    const data = await resp.json();
    const clientes = data.datos || [];
    tabla.innerHTML = "";

    // i=0 es encabezado en la hoja; recorremos desde 1 e incluimos SOLO activos para UI
    for (let i = 1; i < clientes.length; i++) {
      const c = clientes[i];
      if (!c || !c[0]) continue;

      const saldo = Number(c[9] || 0);
      const estado = (c[10] || "").trim();

      // ✅ Ocultar en UI los eliminados, pagados o con saldo = 0 (no borra de la hoja)
      if (estado === "Eliminado" || estado === "Pagado" || saldo <= 0) continue;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c[0] || ""}</td>
        <td>${c[1] || ""}</td>
        <td>${c[2] || ""}</td>
        <td>${formato(c[3])}</td>
        <td>${formato(c[4])}</td>
        <td>${formato(c[5])}</td>
        <td>${c[6] || ""}</td>
        <td>${formato(c[7])}</td>
        <td>${formato(c[8])}</td>
        <td>${formato(c[9])}</td>
        <td>${c[10] || ""}</td>
        <td>${c[11] || ""}</td>
        <td>
          <button class="editar">✏️</button>
          <button class="eliminar">🗑️</button>
        </td>
      `;
      tabla.appendChild(tr);
    }

    // --- Acciones de editar ---
    document.querySelectorAll(".editar").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const fila = e.target.closest("tr");
        const codigo = fila.children[0].textContent.trim();
        const nombreAct = fila.children[1].textContent.trim();
        const telAct = fila.children[2].textContent.trim();
        const montoAct = Number(
          fila.children[3].textContent.replace(/[^\d]/g, "")
        );
        const cuotasAct = parseInt(fila.children[6].textContent, 10) || 0;

        const nombreNuevo = prompt("Nuevo nombre:", nombreAct);
        if (!nombreNuevo) return;
        const telNuevo = prompt("Nuevo teléfono:", telAct);
        if (!telNuevo) return;
        const montoNuevo = prompt("Nuevo monto:", montoAct);
        if (!montoNuevo) return;
        const cuotasNueva = prompt("Nuevas cuotas:", cuotasAct);
        if (!cuotasNueva) return;

        try {
          const resp = await fetch("/api/clientes/editar", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              codigo,
              nombre: nombreNuevo.trim(),
              telefono: telNuevo.trim(),
              monto: montoNuevo.trim(),
              cuotas: cuotasNueva.trim(),
            }),
          });
          const text = await resp.text();
          if (!resp.ok) throw new Error(text);
          alert(text);
          await cargarClientes();
          await actualizarConsolidado();
        } catch (err) {
          alert("❌ " + err.message);
        }
      })
    );

    // --- Acciones de eliminar (ocultar en UI, marcar en hoja) ---
    document.querySelectorAll(".eliminar").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const fila = e.target.closest("tr");
        const codigo = fila.children[0].textContent.trim();
        if (!confirm(`¿Ocultar en la interfaz al cliente ${codigo}?`)) return;
        try {
          const resp = await fetch(`/api/clientes/eliminar/${codigo}`, {
            method: "DELETE",
          });
          const text = await resp.text();
          if (!resp.ok) throw new Error(text);
          alert(text);
          await cargarClientes();
          await actualizarConsolidado();
        } catch (err) {
          alert("❌ " + err.message);
        }
      })
    );

    // Si no hay filas visibles:
    if (!tabla.children.length) {
      tabla.innerHTML =
        "<tr><td colspan='13'>No hay clientes activos para mostrar.</td></tr>";
    }
  } catch {
    tabla.innerHTML = "<tr><td colspan='13'>❌ Error al cargar datos.</td></tr>";
  }
}

// --- Consolidado automático ---
async function actualizarConsolidado() {
  try {
    const resp = await fetch("/api/consolidado");
    const data = await resp.json();
    totalCapital.textContent = formato(data.capital);
    totalInteres.textContent = formato(data.interes);
    totalRecaudado.textContent = formato(data.totalRecaudado);
    totalSemanal.textContent = formato(data.recSem);
    totalMensual.textContent = formato(data.recMes);
    totalAnual.textContent = formato(data.recAnual);
  } catch (err) {
    console.error("Error actualizando consolidado:", err);
  }
}

// --- Generar PDF ---
document.getElementById("btnPDF").addEventListener("click", () => {
  const tipo = document.getElementById("filtroPDF").value;
  let valor = "";
  if (tipo === "cliente") {
    valor = prompt("Ingrese el nombre o código del cliente:");
    if (!valor) return alert("⚠️ Debe ingresar un cliente válido.");
  }
  // ⚠️ El PDF se genera SIEMPRE con datos de la hoja (server.js),
  // incluyendo clientes Eliminados o Pagados (según tu requerimiento final).
  const url = `/api/pdf/clientes?tipo=${tipo}&valor=${encodeURIComponent(valor)}`;
  window.open(url, "_blank");
});

// --- Al iniciar ---
window.addEventListener("load", async () => {
  await cargarClientes();
  await actualizarConsolidado();
});
