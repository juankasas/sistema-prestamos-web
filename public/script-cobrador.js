// ============================= 
//  SCRIPT COBRADOR - FINANZAS JKzas (CUOTAS)
//  ✅ Ajustes: coherente con ocultamiento UI (saldo 0 / pagado)
// =============================
const cliente = document.getElementById("cliente");
const cuota = document.getElementById("cuota");
const valor = document.getElementById("valor");
const obs = document.getElementById("obs");
const mensaje = document.getElementById("mensaje");
const tbody = document.querySelector("#tablaHistorial tbody");

// Cargar historial al abrir
window.addEventListener("load", async () => {
  await cargarPagos();
  await actualizarConsolidado(); // ✅ Refresca consolidado del dueño
});

// --- Cargar pagos ---
async function cargarPagos() {
  tbody.innerHTML = "<tr><td colspan='7'>Cargando pagos...</td></tr>";
  try {
    const respPagos = await fetch("/api/pagos");
    const dataPagos = await respPagos.json();
    const pagos = dataPagos.pagos || [];

    const respClientes = await fetch("/api/datos");
    const dataClientes = await respClientes.json();
    const clientes = dataClientes.datos || [];

    tbody.innerHTML = "";

    pagos.forEach((p) => {
      // Buscar cliente correspondiente para revisar su estado
      const clienteAsociado = clientes.find(
        (c, i) =>
          i > 0 &&
          (c[0] === p.cliente || c[1]?.trim().toLowerCase() === p.cliente?.trim().toLowerCase())
      );
      const estado = (clienteAsociado?.[10] || "").trim().toLowerCase();

      // 🔒 Ocultar de la interfaz si está pagado o eliminado
      if (estado === "pagado" || estado === "eliminado") return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.rowNumber}</td>
        <td>${p.cliente}</td>
        <td>${p.cuota}</td>
        <td>$${Number(p.valor || 0).toLocaleString("es-CO")}</td>
        <td>${p.observacion || "-"}</td>
        <td>${p.fecha || ""}</td>
        <td><button class="editar" data-row="${p.rowNumber}">✏️ Editar</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".editar").forEach((btn) =>
      btn.addEventListener("click", (e) =>
        abrirEdicionPago(parseInt(e.target.dataset.row, 10))
      )
    );

    if (!tbody.children.length) {
      tbody.innerHTML = "<tr><td colspan='7'>No hay pagos registrados.</td></tr>";
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = "<tr><td colspan='7'>Error cargando pagos.</td></tr>";
  }
}

// --- Registrar pago (acepta nombre o código) ---
document.getElementById("btn-guardar").addEventListener("click", async () => {
  const cli = cliente.value.trim();
  const cuo = parseInt(cuota.value);
  const val = parseFloat(valor.value);
  const ob = obs.value.trim();

  if (!cli || !cuo || !val) {
    mensaje.style.color = "red";
    mensaje.textContent = "⚠️ Completa Cliente, Cuota y Valor.";
    return;
  }

  try {
    const resp = await fetch("/api/pagos/agregar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: cli,
        cuota: cuo,
        valor: val,
        observacion: ob,
        fecha: new Date().toLocaleDateString("es-CO"),
      }),
    });

    const text = await resp.text();
    if (!resp.ok) throw new Error(text);

    mensaje.style.color = "green";
    mensaje.textContent = text;

    // ✅ recargar historial sin eliminar registros previos
    await cargarPagos();
    await actualizarConsolidado(); // refresca consolidado

    // limpiar inputs
    cliente.value = cuota.value = valor.value = obs.value = "";
  } catch (err) {
    mensaje.style.color = "red";
    mensaje.textContent =
      "❌ " + (err.message || "Error al registrar el pago.");
    console.error(err);
  }
});

// --- Abrir edición con datos existentes ---
function abrirEdicionPago(rowNumber) {
  const row = [...tbody.querySelectorAll("tr")].find(
    (tr) => parseInt(tr.children[0].textContent, 10) === rowNumber
  );
  if (!row) return;

  cliente.value = row.children[1].textContent;
  cuota.value = row.children[2].textContent;
  valor.value = row.children[3].textContent.replace(/[^\d]/g, "");
  obs.value = row.children[4].textContent;

  const confirmar = confirm(
    "¿Actualizar este pago con los datos cargados arriba?"
  );
  if (!confirmar) return;

  editarPago(rowNumber);
}

// --- Editar pago (usa los campos del formulario actual) ---
async function editarPago(rowNumber) {
  const cli = cliente.value.trim();
  const cuo = parseInt(cuota.value);
  const val = parseFloat(valor.value);
  const ob = obs.value.trim();
  const f = new Date().toLocaleDateString("es-CO");

  if (!rowNumber || !cli || !cuo || !val) {
    alert("⚠️ Faltan datos para editar.");
    return;
  }

  try {
    const resp = await fetch("/api/pagos/editar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rowNumber,
        cliente: cli,
        cuota: cuo,
        valor: val,
        observacion: ob,
        fecha: f,
      }),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(text);

    alert(text);
    await cargarPagos();
    await actualizarConsolidado();
  } catch (err) {
    console.error(err);
    alert("❌ " + (err.message || "Error editando pago."));
  }
}

// --- Consolidado automático ---
async function actualizarConsolidado() {
  try {
    await fetch("/api/consolidado"); // solo actualiza backend
  } catch (err) {
    console.error("Error refrescando consolidado:", err);
  }
}
