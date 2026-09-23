const API_URL = '/api/marcaciones';

const form = document.querySelector('#marcacionForm');
const filterForm = document.querySelector('#filterForm');
const body = document.querySelector('#recordsBody');
const emptyState = document.querySelector('#emptyState');
const recordCount = document.querySelector('#recordCount');
const notice = document.querySelector('#notice');
const formErrors = document.querySelector('#formErrors');
const apiIndicator = document.querySelector('#apiIndicator');
const submitButton = document.querySelector('#submitButton');
const cancelEdit = document.querySelector('#cancelEdit');

let records = [];

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

document.querySelector('#fecha').value = today();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function time(value) { return value ? value.slice(0, 5) : '—'; }

function showMessage(element, message, kind = 'success') {
  element.className = `message ${kind}`;
  element.textContent = message;
  window.setTimeout(() => element.classList.add('hidden'), 5000);
}

function showErrors(errors) {
  const items = Array.isArray(errors) ? errors : [errors];
  formErrors.innerHTML = `<strong>Revisa los datos:</strong><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
  formErrors.classList.remove('hidden');
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la solicitud.');
    error.details = payload.errors;
    throw error;
  }
  return payload;
}

async function checkApi() {
  try {
    const response = await fetch('/health-api');
    if (!response.ok) throw new Error();
    apiIndicator.className = 'api-indicator online';
    apiIndicator.lastChild.textContent = ' API conectada';
  } catch (_error) {
    apiIndicator.className = 'api-indicator offline';
    apiIndicator.lastChild.textContent = ' API no disponible';
  }
}

function render() {
  recordCount.textContent = `${records.length} ${records.length === 1 ? 'registro' : 'registros'}`;
  emptyState.classList.toggle('hidden', records.length > 0);
  body.innerHTML = records.map((record) => `
    <tr>
      <td class="employee">
        <strong>${escapeHtml(record.nombre_empleado)}</strong>
        <span>${escapeHtml(record.codigo_empleado)}</span>
      </td>
      <td>${formatDate(record.fecha)}</td>
      <td><span class="time-value">${time(record.hora_ingreso_real)}</span><span class="scheduled">Prog. ${time(record.hora_ingreso_programada)}</span></td>
      <td><span class="time-value">${time(record.hora_salida_real)}</span><span class="scheduled">Prog. ${time(record.hora_salida_programada)}</span></td>
      <td><span class="badge ${record.estado.toLowerCase()}">${escapeHtml(record.estado)}</span></td>
      <td>
        <div class="actions">
          <button class="button ghost" type="button" data-action="edit" data-id="${record.id}">Editar</button>
          <button class="button danger" type="button" data-action="delete" data-id="${record.id}">Eliminar</button>
        </div>
      </td>
    </tr>`).join('');
}

async function loadRecords() {
  const params = new URLSearchParams();
  const empleado = document.querySelector('#filterEmpleado').value.trim();
  const fecha = document.querySelector('#filterFecha').value;
  if (empleado) params.set('empleado', empleado);
  if (fecha) params.set('fecha', fecha);

  try {
    records = await request(`${API_URL}${params.size ? `?${params}` : ''}`);
    render();
    await checkApi();
  } catch (error) {
    records = [];
    render();
    showMessage(notice, error.message, 'error');
    await checkApi();
  }
}

function formData() {
  return Object.fromEntries([
    'codigo_empleado', 'nombre_empleado', 'fecha',
    'hora_ingreso_programada', 'hora_ingreso_real',
    'hora_salida_programada', 'hora_salida_real', 'observacion',
  ].map((id) => [id, document.querySelector(`#${id}`).value]));
}

function resetForm() {
  form.reset();
  document.querySelector('#recordId').value = '';
  document.querySelector('#fecha').value = today();
  document.querySelector('#hora_ingreso_programada').value = '08:00';
  document.querySelector('#hora_salida_programada').value = '16:00';
  document.querySelector('#formMode').textContent = 'Nuevo registro';
  document.querySelector('#formTitle').textContent = 'Registrar marcación';
  submitButton.textContent = 'Guardar marcación';
  cancelEdit.classList.add('hidden');
  formErrors.classList.add('hidden');
}

function startEdit(record) {
  for (const [key, value] of Object.entries(record)) {
    const input = document.querySelector(`#${key}`);
    if (input) input.value = value ?? '';
  }
  document.querySelector('#recordId').value = record.id;
  document.querySelector('#formMode').textContent = `Editando registro #${record.id}`;
  document.querySelector('#formTitle').textContent = 'Actualizar marcación';
  submitButton.textContent = 'Guardar cambios';
  cancelEdit.classList.remove('hidden');
  formErrors.classList.add('hidden');
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formErrors.classList.add('hidden');
  const id = document.querySelector('#recordId').value;
  submitButton.disabled = true;
  submitButton.textContent = id ? 'Guardando cambios…' : 'Guardando…';

  try {
    const saved = await request(id ? `${API_URL}/${id}` : API_URL, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(formData()),
    });
    resetForm();
    await loadRecords();
    showMessage(notice, id ? `Marcación #${saved.id} actualizada.` : `Marcación #${saved.id} registrada.`);
  } catch (error) {
    showErrors(error.details || error.message);
  } finally {
    submitButton.disabled = false;
    if (!document.querySelector('#recordId').value) submitButton.textContent = 'Guardar marcación';
  }
});

filterForm.addEventListener('submit', async (event) => { event.preventDefault(); await loadRecords(); });

document.querySelector('#clearFilters').addEventListener('click', async () => {
  filterForm.reset();
  await loadRecords();
});

cancelEdit.addEventListener('click', resetForm);

body.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  const record = records.find((item) => item.id === id);
  if (!record) return;

  if (button.dataset.action === 'edit') {
    startEdit(record);
    return;
  }

  if (button.dataset.action === 'delete') {
    const confirmed = window.confirm(`¿Eliminar la marcación de ${record.nombre_empleado}?`);
    if (!confirmed) return;
    try {
      await request(`${API_URL}/${id}`, { method: 'DELETE' });
      await loadRecords();
      showMessage(notice, `Marcación #${id} eliminada.`);
    } catch (error) {
      showMessage(notice, error.message, 'error');
    }
  }
});

loadRecords();
