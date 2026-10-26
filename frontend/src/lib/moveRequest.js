// frontend/src/lib/moveRequest.js
// Move Inventory Request Display Support Event (Blueprint MJU 3.2.15 / MKT14).

export const MOVE_STATUS = {
  NEW: { label: 'Menunggu On-Hand', tone: 'wait' },
  CHECKED: { label: 'On-Hand diperiksa', tone: 'wait' },
  REQUESTED: { label: 'Menunggu Warehouse', tone: 'wait' },
  TRANSFERRED: { label: 'Sudah ditransfer', tone: 'wait' },
  ISSUED: { label: 'Barang dikeluarkan', tone: 'wait' },
  DONE: { label: 'Selesai', tone: 'on' },
}

export const moveStatusMeta = (s) => MOVE_STATUS[s] || { label: s || '—', tone: 'off' }

// Marketing (supervisor, admin) dan Warehouse mengerjakan proses ini; server tetap yang memutuskan siapa boleh melakukan tiap langkah.
export const canMoveRequest = (user) => ['supervisor', 'admin', 'warehouse'].includes(user?.role)
export const canCreateMoveRequest = (user) => ['supervisor', 'admin'].includes(user?.role)

// Dua jenis permintaan memakai halaman yang sama: display untuk event (MKT14) dan sample internal (MKT15, tanpa event).
export const MOVE_KINDS = {
  display: {
    path: '/marketing/move-requests', title: 'Move Inventory', withEvent: true,
    listHero: 'permintaan barang display untuk event', itemsCountLabel: 'barang display', searchPlaceholder: 'Cari nomor permintaan atau nama event',
    emptyHint: 'Marketing membuat permintaan untuk memindahkan barang display dari WH FG ke WH Marketing.',
    newTitle: 'Permintaan Baru', editTitle: 'Ubah Permintaan', itemsTitle: 'Barang Display',
    onhandHint: 'Periksa On-Hand tiap barang di Inventory Marketing untuk memastikan ketersediaan barang display, lalu catat hasilnya.',
    lastTitle: 'Penerima dan Nama Event (Remarks)',
  },
  sample: {
    path: '/marketing/sample-requests', title: 'Sample Internal', withEvent: false,
    listHero: 'permintaan sample internal', itemsCountLabel: 'barang sample', searchPlaceholder: 'Cari nomor permintaan',
    emptyHint: 'Marketing membuat permintaan untuk memindahkan sample dari WH FG ke WH Marketing.',
    newTitle: 'Sample Baru', editTitle: 'Ubah Sample', itemsTitle: 'Barang Sample',
    onhandHint: 'Periksa On-Hand tiap sample di Inventory Marketing, lalu catat hasilnya.',
    lastTitle: 'Nama Sales dan Peruntukannya (Remarks)',
  },
}