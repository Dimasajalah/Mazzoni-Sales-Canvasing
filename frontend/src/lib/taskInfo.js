// frontend/src/lib/taskInfo.js
// Informasi tampilan task menurut kode (dokumen hal. 26 dan 28).

// Deskripsi tugas di kartu header halaman task. Task lain menyusul begitu teks dokumennya tersedia.
export const TASK_DESCRIPTIONS = {
  BRANDAW:
    "First task after a Lead is registered - the salesman introduces Mazzoni's brand and product range to the prospect before NOO verification, No sample is handed out yet; that only starts once this prospect is marked Tertarik",
}

// Pemberian Sample bernomor: kode GIVESMPL1, GIVESMPL2, ... (nomor = revisi sample ke-n untuk lead itu).
export const SAMPLE_MAX_REVISIONS = 3
export function sampleRevision(task) {
  const m = /^GIVESMPL(\d+)$/.exec(task?.code || '')
  return m ? Number(m[1]) : null
}

/** Judul kartu: "Pemberian Sample 2" untuk GIVESMPL2; selain itu nama tugas apa adanya. */
export function taskTitle(task) {
  const n = sampleRevision(task)
  return n ? `Pemberian Sample ${n}` : task?.name
}

/**
 * Tampilan tugas untuk halaman Follow Up Sample (dokumen hal. 30): judul "Follow Up Sample n", Task ID FUSMPLn,
 * Task Type "Sampling follow-up". Hanya untuk tampilan; data tugas aslinya (kode GIVESMPLn) tidak diubah.
 */
export function followUpView(task) {
  const n = sampleRevision(task)
  return {
    ...task,
    name: n ? `Follow Up Sample ${n}` : 'Follow Up Sample',
    code: n ? `FUSMPL${n}` : null,
    task_type: 'Sampling follow-up',
  }
}