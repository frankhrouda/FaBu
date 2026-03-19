export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatKm(km) {
  if (km == null) return '—';
  return `${Number(km).toLocaleString('de-DE')} km`;
}

export function statusBadge(status) {
  switch (status) {
    case 'reserved': return 'bg-blue-100 text-blue-700';
    case 'completed': return 'bg-emerald-100 text-emerald-700';
    case 'cancelled': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

export function statusLabel(status) {
  switch (status) {
    case 'reserved': return 'Reserviert';
    case 'completed': return 'Abgeschlossen';
    case 'cancelled': return 'Storniert';
    default: return status;
  }
}

export function vehicleTypeIcon(type) {
  switch (type) {
    case 'LKW': return '🚛';
    case 'Transporter': return '🚐';
    case 'Motorrad': return '🏍️';
    default: return '🚗';
  }
}
